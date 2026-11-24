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
    if (
      (table !== undefined && table !== "u") ||
      !["id", "active"].includes(name)
    ) {
      throw new Error(`Column denied: ${table ?? ""}.${name}`);
    }
  },
});

// Supply tenant identity from the authenticated server context.
const tenantId = "tenant-123";
const { sql, bindings } = query.toSQLWithBindings(Q.flavors.sqlite, {
  transformTable: (name) =>
    Q.select().from(name).where(Cond.equal("tenant_id", tenantId)),
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
Without transforms, existing `toSQL()` output is unchanged.

Transforms reach every nested SELECT in the supplied AST, including condition
subqueries, function arguments, JOIN ON, HAVING, GROUP BY, ORDER BY, UNION operands,
INSERT SELECT, UPDATE sub-selects, and CREATE TABLE/VIEW AS SELECT. Both inline
and bound rendering use the same transforms. Custom flavor overrides of
`escapeFunction(fn, options?)` and `escapeOperation(fn, options?)` must forward
`options` to their arguments' `toSQL(flavor, options)` calls. Mutation targets continue to use
`transformInsertMutation`, `transformUpdateMutation`, and `transformDeleteMutation`;
`transformTable` scopes their SELECT sources. A replacement returned by
`transformTable` is trusted SQL-builder AST: that table callback is disabled within
the replacement to prevent recursive wrapping. Scope any additional tables your
replacement introduces in the trusted callback itself.

Use `Cond.exists(subquery)` for policy quantifiers such as “has any matching
patient”, and `Cond.notExists(subquery)` for “has none”. Unlike `NOT IN`,
`NOT EXISTS` is unaffected by NULL values in the selected subquery column:

```ts
const matchingPatient = Q.select()
  .field("p.id")
  .from("patients", "p")
  .where(Cond.columnEqual("p.id", "j.patient_id"));
const policyQuery = Q.select()
  .field("j.id")
  .from("jobs", "j")
  .where(Cond.exists(matchingPatient)); // or Cond.notExists(matchingPatient)
const result = policyQuery.toSQLWithBindings(Q.flavors.sqlite, {
  transformTable: (name) =>
    Q.select().from(name).where(Cond.equal("organization_id", tenantId)),
});
// SELECT `j`.`id` FROM (SELECT * FROM `jobs` WHERE `organization_id` = ?) AS `j`
// WHERE EXISTS (SELECT `p`.`id` FROM
//   (SELECT * FROM `patients` WHERE `organization_id` = ?) AS `p`
//   WHERE `p`.`id` = `j`.`patient_id`)
// bindings: [tenantId, tenantId]
```

Give correlated tables explicit aliases (`j` and `p` here). Table transforms keep
those aliases on their derived-table wrappers and do not rewrite column references;
`j.patient_id` therefore still refers to the wrapped outer row. The wrapper must
expose the referenced columns (for example, via `SELECT *`). Without an explicit
alias, derived tables use the existing default `t`; original table-name qualifiers
are not automatically remapped. EXISTS predicates support legacy and versioned
query serialization, strict deserialization, `walk`, and `summarize`; their SELECT
adds one subquery level for both `maxDepth` validation and summary depth.

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
{
  "v": 1,
  "type": "SelectQuery",
  "tables": [{ "type": "Table", "source": "users" }]
}
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

## DuckDB, typed DDL and introspection

```ts
import { Q, T, L, flavorCapabilities } from "@jakub.knejzlik/ts-query";

const query = Q.select().field("id").from("events").limit(10).offset(2);
query.toSQL(Q.flavors.duckdb);
// SELECT "id" FROM "events" LIMIT 10 OFFSET 2
query.toSQLWithBindings(Q.flavors.duckdb);
// { sql: 'SELECT "id" FROM "events" LIMIT $1 OFFSET $2', bindings: [10, 2] }

const create = Q.createTable("events", { ifNotExists: true })
  .column("id", T.int64(), { nullable: false, primaryKey: true })
  .column("label", T.string(), { default: L.string("untitled") })
  .column("amount", T.decimal(18, 2))
  .column("active", T.boolean(), { default: L.boolean(true) });
create.toSQL(Q.flavors.duckdb);
Q.alterTable("events")
  .addColumn("created", T.timestamp())
  .toSQL(Q.flavors.duckdb);
Q.alterTable("events").renameColumn("label", "name").toSQL(Q.flavors.duckdb);
Q.alterTable("events").dropColumn("amount").toSQL(Q.flavors.duckdb);
Q.dropTable("events", { ifExists: true }).toSQL(Q.flavors.duckdb);

flavorCapabilities.duckdb.operations.includes("addColumn"); // true
Q.flavors.duckdb.capabilities.types.includes("uuid"); // true
```

DuckDB uses double-quoted identifiers (embedded `"` becomes `""`), single-quoted
strings, one-based `$1`, `$2`, … placeholders, LIMIT/OFFSET, native ILIKE,
boolean literals, and TIMESTAMP literals for JavaScript Dates. Dates use the
existing flavor timezone option and wall-clock formatting. YEAR/MONTH use
EXTRACT, IF uses CASE, IFNULL uses COALESCE, and DATEADD uses a validated interval;
other function names follow existing flavors' pass-through convention.

The new builders return copies. `CreateTable`, `DropTable`, and `AlterTable`
implement `toSQL`, `toJSON`, `serialize`, `clone`, `getOperationType`, and
`getTableNames`. Typed accessors include `getTableName`, `getColumns`, `getAction`,
`getIfExists`, and `getIfNotExists` where applicable. `walk` and `summarize` also
support these nodes. Each ALTER node represents exactly one action; requesting a
second action throws. Empty CREATE/ALTER builders cannot render or serialize.
Flags can also be set with `.ifNotExists()` / `.ifExists()`; ALTER's `ifExists`
refers to the table, not the column.

Types are closed tagged objects made by `T.boolean()`, `T.int32()`, `T.int64()`,
`T.float64()`, `T.decimal(precision, scale)`, `T.string()`, `T.date()`,
`T.timestamp()`, `T.timestamptz()`, `T.json()`, and `T.uuid()`.
Decimals require integer precision 1–38 and scale 0–precision (MySQL scale ≤30).
No type accepts a raw SQL string. Defaults accept only `L.null()`,
`L.boolean(value)`, `L.number(finiteNumber)`, and `L.string(value)`; expression
nodes and raw SQL are rejected. Numbers retain JavaScript number precision;
large exact int64/decimal defaults are deferred. The database checks default/type
compatibility and existing-data constraints when executing. DDL defaults are
escaped inline constants, including with `toSQLWithBindings`; PostgreSQL uses
explicit escape strings for backslash-containing defaults, independent of
`standard_conforming_strings`. Introspection filters support bindings. There
are no runtime database dependencies.

New schema AST identifiers always pass the existing identifier grammar with
additional restrictions: tables may be `name` or `schema.name`, columns and schema
filters are unqualified, and `*`, `@`, SQL punctuation, and quotes are rejected.
Validated components are always quoted, including names such as `NULL`. Duplicate
columns (case-insensitive), multiple column primary keys, nullable primary keys,
and NULL defaults on non-null columns are rejected. These restrictions apply only
to the new nodes; existing SELECT/CTAS/CVAS identifier behavior is unchanged.

### Capability matrix

The frozen, exported `flavorCapabilities` matrix is also available through each
built-in flavor's optional `capabilities` member. Custom `ISQLFlavor`
implementations need no changes: omission disables new DDL/introspection.
Unsupported operations, types, flags, or options throw `UnsupportedOperationError`
with stable `code: "unsupported_operation"` and an `operation` field. Nothing is
silently discarded. The matrix describes this library's supported slice, not every
feature of the underlying database.

| Capability                            | DuckDB (tested 2.0) | PostgreSQL      | SQLite (3.35+)                          | MySQL (8.0+)                     | Timestream |
| ------------------------------------- | ------------------- | --------------- | --------------------------------------- | -------------------------------- | ---------- |
| CREATE / DROP TABLE                   | Yes                 | Yes             | Yes                                     | Yes                              | No         |
| ADD / DROP / RENAME COLUMN            | Yes                 | Yes             | Yes                                     | Yes                              | No         |
| CREATE IF NOT EXISTS / DROP IF EXISTS | Yes                 | Yes             | Yes                                     | Yes                              | No         |
| ALTER TABLE IF EXISTS                 | Yes                 | Yes             | No                                      | No                               | No         |
| Types                                 | All `T` types       | All `T` types   | boolean, int32, int64, float64, string  | All except timestamptz, uuid     | None       |
| CREATE nullable / typed default       | Yes                 | Yes             | Yes                                     | Yes, defaults except string/json | No         |
| CREATE single-column PK               | All types           | All except json | All supported types                     | All except string/json           | No         |
| ADD nullable / typed default          | Yes                 | Yes             | Yes, NOT NULL requires non-null default | Yes, defaults except string/json | No         |
| ADD single-column PK                  | No                  | All except json | No                                      | All except string/json           | No         |
| All four introspection requests       | Yes                 | Yes             | No                                      | No                               | No         |

`T.string()` renders VARCHAR in DuckDB and TEXT in PostgreSQL/SQLite/MySQL;
`T.float64()` renders DOUBLE, DOUBLE PRECISION, REAL, and DOUBLE respectively.
MySQL timestamps render DATETIME, without automatic initialization. SQLite uses
its ordinary affinity model: int32/int64 both render INTEGER, and boolean renders
BOOLEAN; widths and boolean domains are not enforced. INTEGER PRIMARY KEY has
SQLite's normal rowid semantics. SQLite temporal/decimal/json/uuid types are
conservatively unsupported. MySQL TEXT/JSON literal defaults and primary keys are
conservatively unsupported; string defaults containing backslashes on other types
also throw because their interpretation depends on `sql_mode`.

Support is checked against the documented syntax for
[DuckDB CREATE](https://duckdb.org/docs/2.0/sql/statements/create_table),
[DuckDB ALTER](https://duckdb.org/docs/2.0/sql/statements/alter_table),
[PostgreSQL CREATE](https://www.postgresql.org/docs/current/sql-createtable.html),
[PostgreSQL ALTER](https://www.postgresql.org/docs/current/sql-altertable.html),
[SQLite CREATE](https://www.sqlite.org/lang_createtable.html),
[SQLite ALTER](https://www.sqlite.org/lang_altertable.html),
[MySQL CREATE](https://dev.mysql.com/doc/refman/8.4/en/create-table.html),
[MySQL ALTER](https://dev.mysql.com/doc/refman/8.4/en/alter-table.html), and
[MySQL defaults](https://dev.mysql.com/doc/refman/8.4/en/data-type-defaults.html).
Generated SQL is unit-tested for every supported flavor. DuckDB and PostgreSQL
also have in-memory execution tests; MySQL has no execution adapter in this repo.
The DuckDB devDependency uses platform-specific prebuilt Node-API binaries;
loading/querying was verified on Node 20, 22, 24, 25 and 26 on macOS arm64.

### Introspection is a request; execution is the consumer's job

```ts
const schemas = Q.showSchemas();
const tables = Q.showTables({ schema: "main" }); // schema is optional
const description = Q.describeTable("main.events");
const columns = Q.showColumns("main.events");

columns.toJSON(); // { type: "ShowColumns", tableName: "main.events" }
columns.getTableName(); // "main.events"
tables.getSchema(); // "main"
columns.toSQL(Q.flavors.duckdb); // an information_schema.columns SELECT
```

`ShowSchemas`, `ShowTables`, `DescribeTable`, and `ShowColumns` are distinct
serializable node classes with `clone`, typed accessors, and a plain `toJSON()`
request shape. DuckDB and PostgreSQL render information_schema queries:
ShowSchemas returns `schema_name`; ShowTables returns `table_schema`, `table_name`,
and `table_type` (including views); DescribeTable and ShowColumns both return
`column_name`, `data_type`, `is_nullable`, `column_default`, and `ordinal_position`,
ordered by column position. Tables/columns are restricted to `current_database()`
and the supplied schema or `current_schema()`; schema listing covers visible
schemas. Catalog contents and permissions determine the results.
See [DuckDB information_schema](https://duckdb.org/docs/2.0/sql/meta/information_schema)
and [PostgreSQL columns](https://www.postgresql.org/docs/current/infoschema-columns.html).

**ts-query does not execute SQL or contact a registry.** A consumer can inspect
`instanceof ShowColumns` or the JSON `type` and answer from its own logical
registry without rendering SQL at all. Authorization, name resolution, execution,
and the response format belong to that consumer. Introspection is not a promise
that a physical table exists. `DescribeTable` describes columns, not indexes or
all constraints.

### Allowlisting untrusted schema requests

```ts
const request = Q.showColumns("main.events").serialize({ version: 1 });
const node = Q.deserialize(request, {
  allowedNodes: ["ShowColumns"],
  allowRaw: false,
  functions: [],
  maxDepth: 0,
});
// Authorize node.getTableNames() or inspect node.toJSON(), then answer/render.

const ddl = create.serialize({ version: 1, compress: true });
Q.deserialize(ddl, { allowedNodes: ["CreateTable"], allowRaw: false });
// Q.deserialize(ddl) throws DeserializeError with code "node_not_allowed".
```

`allowedNodes?: string[]` is an exact, case-sensitive allowlist of **query node
kinds** at every query edge: `SelectQuery`, `InsertMutation`, `UpdateMutation`,
`DeleteMutation`, existing `ctas`/`cvas`, and the exported `schemaNodeKinds`
(`CreateTable`, `DropTable`, `AlterTable`, `ShowSchemas`, `ShowTables`,
`DescribeTable`, `ShowColumns`). Conditions, expressions and tables continue to use
the existing `allowRaw`, `functions`, identifier, and depth guards. An empty
allowlist denies all query nodes. For example, CTAS requires both `ctas` and
`SelectQuery`. Omission keeps existing kinds permissive, while **new DDL and
introspection nodes always require explicit inclusion**, even with `allowRaw: true`.

New nodes always validate every field and reject unknown properties at the
root, column, type, options, default, and ALTER-action levels. Their public
`fromJSON` factories also validate structure; those factories are trusted AST
construction entry points, not authorization gates. Only `Q.deserialize` enforces
`allowedNodes`. Supported wire versions remain unversioned and `v: 1`, including
compression. No version bump or change to existing serialization encodings is
introduced. Rejections use `DeserializeError` codes `node_not_allowed`,
`invalid_node`, and `unsupported_version`; the existing guard codes and semantics
remain unchanged. Allowlisting a node kind does not authorize a table or operation
for a particular user; apply your application's policy before execution.

### Completed / Deferred

Completed:

- DuckDB flavor: quoting, `$n` bindings, LIMIT/OFFSET, ILIKE, literals, and existing function conventions.
- Typed CREATE/DROP TABLE and single-action ADD/DROP/RENAME COLUMN, column nullability, single-column PK, typed literal defaults, and table existence flags, gated by the capability matrix.
- Closed column types, immutable accessors/JSON, legacy/v1/compressed round trips, and schema support in `walk`/`summarize`.
- Four declarative introspection nodes with DuckDB/PostgreSQL rendering and consumer-owned execution.
- Deny-by-default schema deserialization, query-kind allowlists, strict new-node fields/identifiers/types, and preserved existing guards.
- SQL/rejection tests per flavor and in-memory DuckDB/PostgreSQL execution tests.

Deferred:

- Indexes; composite PKs and constraints beyond single-column PK; ALTER COLUMN TYPE; multiple ALTER actions per node; column-level IF EXISTS/IF NOT EXISTS.
- Iceberg-specific DDL; showRelations; introspection rendering for SQLite/MySQL/Timestream; registry/database execution in the library.
- Raw types/fragments, expression defaults, exact bigint/decimal literal defaults, extra SQLite type mappings, and MySQL TEXT/JSON defaults/PKs or timezone/UUID mappings.
- MySQL execution tests and cross-platform CI execution verification of the DuckDB prebuilt package (local macOS arm64 Node 20–26 checks are included in development evidence).

### Breaking changes

**None.** Existing public exports, required `ISQLFlavor` members, CTAS/CVAS API,
SQL/serialization, v1 format, and default deserialization behavior for existing
node types are preserved. New-only edges: schema requests require an explicit
allowlist, strict schema validation rejects malformed/unknown fields, and absent
capabilities or unsupported features throw. DuckDB's new DATEADD renderer requires
a safe integer amount; existing flavors retain their behavior.

## Testing

Run the test suite using the `test` script:

```sh
npm run test
```

## Contributing

Contributions are welcome. Please submit a pull request or create an issue on the [Github repository](https://github.com/jakubknejzlik/ts-query).

## License

This project is licensed under the MIT License.
