# @jakub.knejzlik/ts-query

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Documentation-blue)](https://jakubknejzlik.github.io/ts-query/?path=/docs/1-query--docs)

TypeScript implementation of an SQL builder. It provides a fluent API to build SQL queries in a type-safe manner.

## Installation

Install the package using npm:

```sh
npm add @jakub.knejzlik/ts-query
```

## Usage

Import the necessary classes and functions from the package:

```ts
import { Q } from "@jakub.knejzlik/ts-query";
```

Create an instance of the Query class and use its methods to build your SQL query:

```ts
const query = new Query();
Q.select().from("users");
console.log(query.toSQL(Q.flavors.mysql));
```

## Documentation

For more detailed usage instructions and API documentation, visit the [Github pages](https://jakubknejzlik.github.io/ts-query/?path=/docs/1-query--docs).

## Testing

Run the test suite using the `test` script:

```sh
npm run test
```

## Contributing

Contributions are welcome. Please submit a pull request or create an issue on the [Github repository](https://github.com/jakubknejzlik/ts-query).

## License

This project is licensed under the MIT License.
