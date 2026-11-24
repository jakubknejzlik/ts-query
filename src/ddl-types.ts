import { DeserializeError, isIdentifier } from "./deserialize";

export type ColumnTypeName =
  | "boolean"
  | "int32"
  | "int64"
  | "float64"
  | "decimal"
  | "string"
  | "date"
  | "timestamp"
  | "timestamptz"
  | "json"
  | "uuid";
export type ColumnType =
  | { readonly kind: Exclude<ColumnTypeName, "decimal"> }
  | {
      readonly kind: "decimal";
      readonly precision: number;
      readonly scale: number;
    };
export type DdlLiteral =
  | { readonly kind: "null" }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string };
export interface ColumnOptions {
  nullable?: boolean;
  primaryKey?: boolean;
  default?: DdlLiteral;
}
export interface ColumnDefinition {
  readonly name: string;
  readonly dataType: ColumnType;
  readonly options: Readonly<ColumnOptions>;
}
export const invalidDdl = (message: string): never => {
  throw new DeserializeError("invalid_node", message);
};
/** Strict object shape shared by builders and the wire validator. */
export function ddlObject(value: any, keys: readonly string[]): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    invalidDdl("Invalid object or unknown property");
}
export function ddlIdentifier(
  value: unknown,
  qualified = false
): asserts value is string {
  if (
    !isIdentifier(value) ||
    value.includes("*") ||
    (!qualified && value.includes(".")) ||
    (qualified && value.split(".").length > 2) ||
    value.includes("@")
  )
    invalidDdl(
      "Invalid DDL identifier (table names allow schema.name; columns are unqualified)"
    );
}
export function validateColumnType(value: any): asserts value is ColumnType {
  ddlObject(
    value,
    value?.kind === "decimal" ? ["kind", "precision", "scale"] : ["kind"]
  );
  if (
    ![
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
    ].includes(value.kind)
  )
    invalidDdl("Unknown column type");
  if (
    value.kind === "decimal" &&
    (!Number.isInteger(value.precision) ||
      value.precision < 1 ||
      value.precision > 38 ||
      !Number.isInteger(value.scale) ||
      value.scale < 0 ||
      value.scale > value.precision)
  )
    invalidDdl(
      "Decimal requires 1 <= precision <= 38 and 0 <= scale <= precision"
    );
}
export function validateLiteral(value: any): asserts value is DdlLiteral {
  ddlObject(value, value?.kind === "null" ? ["kind"] : ["kind", "value"]);
  if (value.kind === "null") return;
  if (
    (value.kind === "boolean" && typeof value.value === "boolean") ||
    (value.kind === "string" &&
      typeof value.value === "string" &&
      !value.value.includes("\0")) ||
    (value.kind === "number" &&
      typeof value.value === "number" &&
      Number.isFinite(value.value))
  )
    return;
  invalidDdl(
    "Expected a typed finite literal; expressions and raw SQL are forbidden"
  );
}
export function columnDefinition(
  name: string,
  dataType: ColumnType,
  options: ColumnOptions = {}
): ColumnDefinition {
  ddlIdentifier(name);
  validateColumnType(dataType);
  ddlObject(options, ["nullable", "primaryKey", "default"]);
  for (const flag of [options.nullable, options.primaryKey])
    if (flag !== undefined && typeof flag !== "boolean")
      invalidDdl("Column flags must be booleans");
  if (options.default !== undefined) validateLiteral(options.default);
  if (options.primaryKey && options.nullable === true)
    invalidDdl("A primary key cannot be nullable");
  if (
    (options.primaryKey || options.nullable === false) &&
    options.default?.kind === "null"
  )
    invalidDdl("A non-null column cannot default to NULL");
  return Object.freeze({
    name,
    dataType: Object.freeze({ ...dataType }),
    options: Object.freeze({
      ...options,
      ...(options.default === undefined
        ? {}
        : { default: Object.freeze({ ...options.default }) }),
    }),
  });
}
function type(kind: Exclude<ColumnTypeName, "decimal">): ColumnType {
  return Object.freeze({ kind });
}
export const T = Object.freeze({
  boolean: () => type("boolean"),
  int32: () => type("int32"),
  int64: () => type("int64"),
  float64: () => type("float64"),
  string: () => type("string"),
  date: () => type("date"),
  timestamp: () => type("timestamp"),
  timestamptz: () => type("timestamptz"),
  json: () => type("json"),
  uuid: () => type("uuid"),
  decimal(precision: number, scale: number): ColumnType {
    const value: ColumnType = { kind: "decimal", precision, scale };
    validateColumnType(value);
    return Object.freeze(value);
  },
});
function literal(value: DdlLiteral): DdlLiteral {
  validateLiteral(value);
  return Object.freeze(value);
}
/** Only these tagged literals, never expression nodes, are accepted as defaults. */
export const L = Object.freeze({
  null: (): DdlLiteral => literal({ kind: "null" }),
  boolean: (value: boolean): DdlLiteral => literal({ kind: "boolean", value }),
  number: (value: number): DdlLiteral => literal({ kind: "number", value }),
  string: (value: string): DdlLiteral => literal({ kind: "string", value }),
});
