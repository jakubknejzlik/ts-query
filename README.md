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

## Guarding untrusted queries

Deserialization alone does not authorize a query. Opt in to structural validation,
reject raw SQL, restrict functions, inspect the AST for your table/column policy,
and then apply trusted transforms before rendering with bindings:

```ts
import { Q, Cond, Fn, SelectQuery, walk } from "@jakub.knejzlik/ts-query";

// Client: request a versioned wire envelope.
const input = Q.select()
  .field(Fn.count("u.id"), "count")
  .from("users", "u")
  .where(Cond.equal("u.active", 1))
  .serialize({ version: 1 });

// Server: validate before generating SQL.
const query = Q.deserialize(input, {
  allowRaw: false,
  functions: ["COUNT"],
  maxDepth: 0,
});
if (!(query instanceof SelectQuery)) throw new Error("Only SELECT is allowed");

walk(query, {
  onTable(name) {
    if (name !== "users") throw new Error(`Table denied: ${name}`);
  },
  onColumn(table, name) {
    if ((table !== undefined && table !== "u") || !["id", "active"].includes(name)) {
      throw new Error(`Column denied: ${table ?? ""}.${name}`);
    }
  },
});

// Supply tenant identity from the authenticated server context.
const tenantId = "tenant-123";
const { sql, bindings } = query.toSQLWithBindings(Q.flavors.sqlite, {
  transformTable: name => Q.select()
    .from(name)
    .where(Cond.equal("tenant_id", tenantId)),
});
// sql: SELECT COUNT(`u`.`id`) AS `count` FROM
//      (SELECT * FROM `users` WHERE `tenant_id` = ?) AS `u` WHERE `u`.`active` = ?
// bindings: ["tenant-123", 1]
// With a Cloudflare D1 binding named db:
// const rows = await db.prepare(sql).bind(...bindings).all();
```

`toSQLWithBindings(flavor?, options?): SQLWithBindings` is available on SELECT,
INSERT, UPDATE, DELETE, expressions, conditions, and CREATE TABLE/VIEW AS SELECT
builders. The standalone `toSQLWithBindings(query, flavor?, options?)` also accepts
any `ISequelizable`. `SQLWithBindings` is `{ sql: string; bindings: unknown[] }`.
The options are the existing `ISequelizableOptions` transforms. The example accepts
only a root SELECT before adding its trusted derived table. Rendering uses
`?` for SQLite/MySQL and `$1`, `$2`, ... for PostgreSQL; custom flavors can supply
`parameterPlaceholder(index: number): string` (one-based).
Values in conditions, IN lists, typed function arguments, mutations, and
LIMIT/OFFSET become bindings in SQL occurrence order. Identifiers stay quoted.
Use `Q.value(value)` for literals; explicit raw SQL and legacy SQL expression
text remain SQL; legacy raw NULL literal markers are bound as null.
Bindings preserve JavaScript values, including Date, boolean,
and bigint; your database adapter must support or convert those types.
DATEADD binds the SQLite modifier or PostgreSQL interval as a single string;
MySQL keeps its validated interval unit as SQL syntax and binds the amount.
Existing `toSQL()` still returns exactly the same inline SQL.

`Q.deserialize(input: string, options?: DeserializeOptions)` accepts plain JSON
or the existing gzip/base64 compressed payload. Its new options are all optional:

- `allowRaw?: boolean` defaults to the existing permissive behavior. Setting it
  to `false` rejects raw expression nodes, including `Q.raw()` and `Q.null()`,
  and legacy free-form SQL such as `"COUNT(id)"`. Use `Fn.count("id")` and
  `Q.value(null)` instead. Empty IN/NOT IN builders currently serialize an
  internal raw NULL marker, so their serialized form is also rejected in this mode.
  Strict mode permits simple identifiers and explicit literal/column encodings;
  malformed identifiers, operators, modifiers, and node shapes are rejected.
- `functions?: string[]` is a case-insensitive allowlist of typed function names.
  Omission allows all names; `[]` denies all. Literal strings that resemble
  function encodings remain data. An allowlist cannot inspect SQL accepted with
  `allowRaw: true`.
- `maxDepth?: number` is a non-negative integer. Root depth is zero, and each
  nested query (including an IN subquery, INSERT SELECT, UPDATE scalar subquery,
  union operand, or CREATE AS SELECT child) adds one. Omission imposes no limit.

Guarded deserialization failures throw the exported `DeserializeError` with a stable `code`:
`raw_not_allowed`, `function_not_allowed`, `max_depth_exceeded`, `invalid_node`,
or `unsupported_version`.

`walk(query: GuardQuery, visitor: QueryVisitor): void` visits SELECT and mutation
trees, as well as CREATE TABLE/VIEW AS SELECT wrappers. Callbacks are optional:

```ts
interface QueryVisitor {
  onTable?(name: string, alias: string | undefined, depth: number): void;
  onColumn?(table: string | undefined, name: string): void;
  onFunction?(name: string): void;
  onSubquery?(depth: number): void;
  onUnion?(): void;
  onRaw?(): void;
  onMutation?(kind: "insert" | "update" | "delete"): void;
}
```

Traversal visits occurrences without modifying the tree or applying transforms.
`onSubquery` includes union operands. Column `table` values are written
qualifiers (possibly aliases), not resolved physical table names. Raw SQL is
reported without attempting to parse its contents. A callback can reject a query
by throwing. `summarize(query: GuardQuery): QuerySummary` returns
`{ tables: string[], columns: QueryColumn[], functions: string[], maxDepth: number,
hasRaw: boolean, hasUnion: boolean, kind: MetadataOperationType }`;
`QueryColumn` is `{ table?: string; name: string }`. Names are deduplicated in
first-visit order. `GuardQuery`, `QueryVisitor`, `QuerySummary`, `QueryColumn`,
`MutationKind`, `SQLWithBindings`, `DeserializeOptions`, and `DeserializeErrorCode`
are exported from the package root.

### Serialization format

`serialize({ version: 1 })` opts in to a root `v: 1` member, for example:

```json
{"v":1,"type":"SelectQuery","tables":[{"type":"Table","source":"users"}]}
```

Version 1 retains the existing AST fields and expression encodings:
`!!!<JSON>` for values, `!D!<epoch milliseconds>!!` for dates,
`!!<JSON>!!` for raw SQL, `FN(<JSON array>)` for functions, and
`OP(<JSON array>)` for arithmetic. Query children are nested objects; UPDATE
values and function/condition expressions may contain serialized strings.
The version applies to the whole tree, so children need no version member.
`serialize({ version: 1, compress: true })` compresses that same envelope.
`deserialize` accepts both unversioned payloads and `v: 1`, and rejects any
other explicit version with `DeserializeError("unsupported_version")`.
Default `serialize()` and `toJSON()` retain the legacy format and bytes.

## Testing

Run the test suite using the `test` script:

```sh
npm run test
```

## Contributing

Contributions are welcome. Please submit a pull request or create an issue on the [Github repository](https://github.com/jakubknejzlik/ts-query).

## License

This project is licensed under the MIT License.
