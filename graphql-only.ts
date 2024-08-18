import {
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLType,
  isEnumType,
  isNonNullType,
  isAbstractType,
  isObjectType,
  isListType,
  graphql,
  buildSchema,
} from "graphql";
import { createFakerInstanceForQuery } from "./faker";
import { match } from "ts-pattern";

type UnwrappedType =
  | GraphQLScalarType
  | GraphQLObjectType
  | GraphQLInterfaceType
  | GraphQLUnionType
  | GraphQLEnumType
  | GraphQLInputObjectType;

export function unwrap(type: GraphQLType): UnwrappedType {
  return "ofType" in type ? unwrap(type.ofType) : type;
}

export function listItemType(type: GraphQLType): GraphQLType {
  if (isNonNullType(type)) {
    return listItemType(type.ofType);
  }

  if (!isListType(type)) {
    throw new Error(
      `Tried to get list item type but ${type.name} is not a list`
    );
  }

  return type?.ofType;
}

/**
 * Checks if a type is a list type or a wrapped list type (ie: wrapped with non-null)
 */
export function hasListType(type: GraphQLType): boolean {
  return isListType(type) || (isNonNullType(type) && isListType(type.ofType));
}

function fakerResolver(parent, _args, _context, info) {
  const { fieldName, returnType } = info;

  const faker = createFakerInstanceForQuery(info);

  function arrayOfRandomLength<T>(createValue: () => T): T[] {
    return Array.from({ length: faker.number.int({ max: 5 }) }, createValue);
  }

  function getValue(allowNull: boolean) {
    const value = match(unwrap(returnType))
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
        throw new Error(`Unsupported type: ${unwrap(returnType).name}`);
      });

    if (allowNull) {
      return faker.helpers.maybe(() => value) ?? null;
    }

    return value;
  }

  if (parent && fieldName in parent) {
    return parent[fieldName];
  }

  const unwrappedReturnType = unwrap(returnType);
  const isList = hasListType(returnType);
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
    const allowNullListItems = !isNonNullType(listItemType(returnType));

    const values = arrayOfRandomLength(() => getValue(allowNullListItems));

    if (!isNonNull) {
      return faker.helpers.maybe(() => values) ?? null;
    }

    return values;
  } else {
    return getValue(!isNonNull);
  }
}

function buildLargeSchema() {
  const typeNames = new Array(10_000)
    .fill(null)
    .map((_, i) => `GraphQLType_${i}`);
  const typeDefinitions = typeNames.map((typeName) =>
    `
        type ${typeName} {
          fieldOne: String
          fieldTwo: String
          fieldThree: String
          fieldFour: String
          fieldFive: String
          fieldSix: String
          fieldSeven: String
          fieldEight: String
          fieldNine: String
          fieldTen: String
        }
      `.trim()
  );

  const typesAsQueryFields = typeNames.map(
    (typeName, i) => `graphQLType_${i}: ${typeName}`
  );

  const schema = `
      schema {
        query: Query
      }
      type Query {
        ${typesAsQueryFields.join("\n")}
      }
      ${typeDefinitions.join("\n")}
    `;

  console.log(
    performance.now(),
    "finished creating schema string, building schema"
  );
  const schemaInstance = buildSchema(schema);
  console.log(performance.now(), "finished creating schema instance");

  return schemaInstance;
}

function query(query: string, variables = {}) {
  return graphql({
    source: query,
    variableValues: variables,
    schema: buildLargeSchema(),
    fieldResolver: fakerResolver,
  });
}

(async function init() {
  console.log(performance.now(), "Calling query...");
  const result = await query(`
    {
      graphQLType_1 {
        fieldOne
        fieldTwo
        fieldThree
        fieldFour
        fieldFive
        fieldSix
        fieldSeven
        fieldEight
        fieldNine
        fieldTen
      }
  
      graphQLType_2 {
        fieldOne
        fieldTwo
        fieldThree
        fieldFour
        fieldFive
        fieldSix
        fieldSeven
        fieldEight
        fieldNine
        fieldTen
      }
  
      graphQLType_3 {
        fieldOne
        fieldTwo
        fieldThree
        fieldFour
        fieldFive
        fieldSix
        fieldSeven
        fieldEight
        fieldNine
        fieldTen
      }
  
      graphQLType_4 {
        fieldOne
        fieldTwo
        fieldThree
        fieldFour
        fieldFive
        fieldSix
        fieldSeven
        fieldEight
        fieldNine
        fieldTen
      }
  
      graphQLType_5 {
        fieldOne
        fieldTwo
        fieldThree
        fieldFour
        fieldFive
        fieldSix
        fieldSeven
        fieldEight
        fieldNine
        fieldTen
      }
  
      graphQLType_6 {
        fieldOne
        fieldTwo
        fieldThree
        fieldFour
        fieldFive
        fieldSix
        fieldSeven
        fieldEight
        fieldNine
        fieldTen
      }
    }
  `);
  console.log(performance.now(), "Finished calling query");
  console.log(result);
})();
