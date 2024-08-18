import type {
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
} from "graphql";
import type { types as gqlMocksTypes } from "graphql-mocks";
import * as gqlMocksHighlight from "graphql-mocks/highlight";
import * as gqlMocksResolverMap from "graphql-mocks/resolver-map";
import { extractDependencies } from "graphql-mocks/resolver";

import { base as baseLocale, en as enLocale, Faker } from "@faker-js/faker";

export function createFakerInstance() {
  return new Faker({ locale: [baseLocale, enLocale] });
}

export function createFakerInstanceForQuery(queryInfo: GraphQLResolveInfo) {
  const faker = createFakerInstance();
  faker.seed(graphqlQueryToSeed(queryInfo));

  return faker;
}

export async function fakerTypeResolver(): Promise<gqlMocksTypes.TypeResolver> {
  return (value, context, info, abstractType) => {
    const { graphqlSchema } = extractDependencies<{
      graphqlSchema: GraphQLSchema;
    }>(context, ["graphqlSchema"]);

    if (value?.__typename) {
      return value.__typename;
    }

    const faker = createFakerInstanceForQuery(info);

    const possibleTypes = graphqlSchema.getPossibleTypes(
      abstractType
    ) as GraphQLObjectType[];
    const chosenType = faker.helpers.arrayElement(possibleTypes);
    return chosenType.name;
  };
}

export function buildGqlResolvedFieldPath(
  path: GraphQLResolveInfo["path"]
): string {
  const fieldPath = path.key;
  if (path.prev) {
    return `${buildGqlResolvedFieldPath(path.prev)}.${fieldPath}`;
  }

  return fieldPath.toString();
}

function stringToNumberHash(input: string) {
  var hash = 0,
    len = input.length;
  for (var i = 0; i < len; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // to 32bit integer
  }
  return hash;
}

export function graphqlQueryToSeed(info: GraphQLResolveInfo): number {
  return stringToNumberHash(
    JSON.stringify({
      path: buildGqlResolvedFieldPath(info.path),
      variableValues: info.variableValues,
    })
  );
}

import {
  isAbstractType,
  isEnumType,
  isNonNullType,
  isObjectType,
} from "graphql";
import type { types as gqlMocksResolverTypes } from "graphql-mocks";
import { typeUtils as gqlMocksTypeUtils } from "graphql-mocks/graphql";
import { match } from "ts-pattern";

export async function fakerFieldResolver(): Promise<gqlMocksResolverTypes.FieldResolver> {
  return function internalFakerResolver(parent, _args, _context, info) {
    const { fieldName, returnType } = info;

    const faker = createFakerInstanceForQuery(info);

    function arrayOfRandomLength<T>(createValue: () => T): T[] {
      return Array.from({ length: faker.number.int({ max: 5 }) }, createValue);
    }

    function getValue(allowNull: boolean) {
      const value = match(gqlMocksTypeUtils.unwrap(returnType))
        .with({ name: "String" }, () => faker.word.sample())
        .with({ name: "Int" }, () => faker.number.int({ min: 0, max: 10_000 }))
        .with({ name: "Float" }, () => faker.number.float())
        .with({ name: "Boolean" }, () => faker.datatype.boolean())
        .with({ name: "ID" }, () => faker.string.uuid())
        .with({ name: "DateTime" }, () => faker.date.recent().toISOString())
        .when(isEnumType, (enumType) => {
          const possibleValues = enumType
            .getValues()
            .map((enumValue) => enumValue.value);

          return faker.helpers.arrayElement(possibleValues);
        })
        .with({ name: "JSON" }, () => ({
          // NOTE: simple basic JSON object
          aProperty: "aValue",
        }))
        .otherwise(() => {
          throw new Error(
            `Unsupported type: ${gqlMocksTypeUtils.unwrap(returnType).name}`
          );
        });

      if (allowNull) {
        return faker.helpers.maybe(() => value) ?? null;
      }

      return value;
    }

    if (parent && fieldName in parent) {
      return parent[fieldName];
    }

    const unwrappedReturnType = gqlMocksTypeUtils.unwrap(returnType);
    const isList = gqlMocksTypeUtils.hasListType(returnType);
    const isNonNull = isNonNullType(returnType);

    if (
      isObjectType(unwrappedReturnType) ||
      isAbstractType(unwrappedReturnType)
    ) {
      // handles list case where the *number* to resolve is determined here
      // but the actual data of each field is handled in follow up recursive
      // resolving for each individual field.
      if (isList) {
        const array = arrayOfRandomLength(() => ({}));
        return array;
      }

      if (unwrappedReturnType.name === "PageInfo") {
        return {
          hasNextPage: false,
          endCursor: null,
        } as any;
      }

      // otherwise, return and let future resolvers figure
      // out the scalar field data
      return {};
    }

    if (isList) {
      const allowNullListItems = !isNonNullType(
        gqlMocksTypeUtils.listItemType(returnType)
      );

      const values = arrayOfRandomLength(() => getValue(allowNullListItems));

      if (!isNonNull) {
        return faker.helpers.maybe(() => values) ?? null;
      }

      return values;
    } else {
      return getValue(!isNonNull);
    }
  };
}

export async function fakerMiddleware(config: {
  graphqlSchema: GraphQLSchema;
}): Promise<gqlMocksTypes.ResolverMapMiddleware> {
  // note that we pass in the schema here as well in order to start doing work ASAP, and not only when the first test runs, which slows it down
  const { graphqlSchema } = config;

  const [fieldResolver, typeResolver] = await Promise.all([
    fakerFieldResolver(),
    fakerTypeResolver(),
  ]);

  const highlighter = gqlMocksHighlight.utils.coerceHighlight(
    graphqlSchema,
    gqlMocksResolverMap.utils.highlightAllCallback
  );

  const fieldResolvableHighlight = highlighter
    .filter(gqlMocksHighlight.field())
    .exclude(gqlMocksHighlight.interfaceField());

  const typeResolvableHighlight = highlighter.filter(
    gqlMocksHighlight.combine(
      gqlMocksHighlight.union(),
      gqlMocksHighlight.interfaces()
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- just know that it's there
  return async (resolverMap, _packOptions) => {
    const fieldResolverPromise = gqlMocksHighlight.utils.walk(
      graphqlSchema,
      fieldResolvableHighlight.references,
      ({ reference }) => {
        gqlMocksResolverMap.setResolver(resolverMap, reference, fieldResolver, {
          graphqlSchema,
        });
      }
    );
    const typeResolverPromise = gqlMocksHighlight.utils.walk(
      graphqlSchema,
      typeResolvableHighlight.references,
      ({ reference }) => {
        gqlMocksResolverMap.setResolver(resolverMap, reference, typeResolver, {
          graphqlSchema,
        });
      }
    );

    await Promise.all([fieldResolverPromise, typeResolverPromise]);

    return resolverMap;
  };
}
