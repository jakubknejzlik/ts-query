import type { ISQLFlavor } from "./Flavor";
import type { ColumnTypeName } from "./ddl-types";

export type DdlOperation =
  | "create_table"
  | "drop_table"
  | "addColumn"
  | "dropColumn"
  | "renameColumn";
export type IntrospectionOperation =
  | "show_schemas"
  | "show_tables"
  | "describe_table"
  | "show_columns";
export type ColumnOptionName = "nullable" | "primaryKey" | "default";
export interface FlavorCapabilities {
  readonly dialect: "duckdb" | "postgres" | "sqlite" | "mysql" | "none";
  readonly operations: readonly (DdlOperation | IntrospectionOperation)[];
  readonly types: readonly ColumnTypeName[];
  readonly createColumnOptions: readonly ColumnOptionName[];
  readonly addColumnOptions: readonly ColumnOptionName[];
  readonly primaryKeyTypes: readonly ColumnTypeName[];
  readonly defaultTypes: readonly ColumnTypeName[];
  readonly createIfNotExists: boolean;
  readonly dropIfExists: boolean;
  readonly alterIfExists: boolean;
  readonly notNullAddRequiresDefault: boolean;
}
const types: ColumnTypeName[] = [
  "boolean",
  "int32",
  "int64",
  "float64",
  "decimal",
  "string",
  "date",
  "timestamp",
  "timestamptz",
  "json",
  "uuid",
];
const ddl: DdlOperation[] = [
  "create_table",
  "drop_table",
  "addColumn",
  "dropColumn",
  "renameColumn",
];
const introspection: IntrospectionOperation[] = [
  "show_schemas",
  "show_tables",
  "describe_table",
  "show_columns",
];
const options: ColumnOptionName[] = ["nullable", "primaryKey", "default"];
function capabilities(value: FlavorCapabilities): FlavorCapabilities {
  Object.values(value).forEach((v) => {
    if (Array.isArray(v)) Object.freeze(v);
  });
  return Object.freeze(value);
}
const common = {
  types,
  createColumnOptions: options,
  primaryKeyTypes: types,
  defaultTypes: types,
  createIfNotExists: true,
  dropIfExists: true,
  alterIfExists: true,
  notNullAddRequiresDefault: false,
};
export const flavorCapabilities = Object.freeze({
  duckdb: capabilities({
    ...common,
    dialect: "duckdb",
    operations: [...ddl, ...introspection],
    addColumnOptions: ["nullable", "default"],
  }),
  postgres: capabilities({
    ...common,
    dialect: "postgres",
    operations: [...ddl, ...introspection],
    primaryKeyTypes: types.filter((t) => t !== "json"),
    addColumnOptions: options,
  }),
  sqlite: capabilities({
    ...common,
    dialect: "sqlite",
    operations: ddl,
    types: ["boolean", "int32", "int64", "float64", "string"],
    primaryKeyTypes: ["boolean", "int32", "int64", "float64", "string"],
    defaultTypes: ["boolean", "int32", "int64", "float64", "string"],
    addColumnOptions: ["nullable", "default"],
    alterIfExists: false,
    notNullAddRequiresDefault: true,
  }),
  mysql: capabilities({
    ...common,
    dialect: "mysql",
    operations: ddl,
    types: types.filter((t) => t !== "timestamptz" && t !== "uuid"),
    primaryKeyTypes: [
      "boolean",
      "int32",
      "int64",
      "float64",
      "decimal",
      "date",
      "timestamp",
    ],
    defaultTypes: [
      "boolean",
      "int32",
      "int64",
      "float64",
      "decimal",
      "date",
      "timestamp",
    ],
    addColumnOptions: options,
    alterIfExists: false,
  }),
  awsTimestream: capabilities({
    dialect: "none",
    operations: [],
    types: [],
    createColumnOptions: [],
    addColumnOptions: [],
    primaryKeyTypes: [],
    defaultTypes: [],
    createIfNotExists: false,
    dropIfExists: false,
    alterIfExists: false,
    notNullAddRequiresDefault: false,
  }),
});
export class UnsupportedOperationError extends Error {
  readonly code = "unsupported_operation";
  constructor(public readonly operation: string) {
    super(`Unsupported operation, type or option: ${operation}`);
    this.name = "UnsupportedOperationError";
  }
}

/** @internal Fail closed before rendering any new schema request. */
export function requireCapability(
  flavor: ISQLFlavor,
  operation: string
): FlavorCapabilities {
  if (!flavor.capabilities?.operations.includes(operation as any))
    throw new UnsupportedOperationError(operation);
  return flavor.capabilities;
}
