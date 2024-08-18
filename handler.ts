import { buildSchema } from "graphql";
import { GraphQLHandler } from "graphql-mocks";
import { fakerMiddleware } from "./faker";

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

(async function init() {
  console.log(performance.now(), "creating schema...");
  const graphqlSchema = buildLargeSchema();
  console.log(performance.now(), "finished creating schema");

  console.log(performance.now(), "creating faker middleware...");
  const fm = await fakerMiddleware({ graphqlSchema });
  console.log(performance.now(), "finished creating faker middleware");

  console.log(performance.now(), "creating graphql handler...");
  const handler = new GraphQLHandler({
    middlewares: [fm],
    dependencies: {
      graphqlSchema,
    },
  });
  console.log(performance.now(), "finished creating graphql handler");

  console.log(performance.now(), "calling pack...");
  await handler.pack();
  console.log(performance.now(), "finished calling pack");

  console.log(performance.now(), "calling query...");
  const result = await handler.query(`
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
  console.log(performance.now(), "finished calling query");

  console.log("Result:", result);
})();
