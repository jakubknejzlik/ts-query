import { assertSerializationVersion } from "./deserialize";
import {
  columnDefinition,
  ddlIdentifier,
  ddlObject,
  invalidDdl,
} from "./ddl-types";

export const schemaNodeKinds = Object.freeze([
  "create_table",
  "drop_table",
  "alter_table",
  "show_schemas",
  "show_tables",
  "describe_table",
  "show_columns",
] as const);
export type SchemaNodeKind = (typeof schemaNodeKinds)[number];
export function isSchemaNodeKind(kind: unknown): kind is SchemaNodeKind {
  return schemaNodeKinds.includes(kind as SchemaNodeKind);
}
export function booleanFlag(value: unknown): void {
  if (typeof value !== "boolean") invalidDdl("Expected boolean flag");
}
export function validateColumn(value: any): void {
  ddlObject(value, ["name", "dataType", "options"]);
  if (value.options === undefined) invalidDdl("Column options are required");
  columnDefinition(value.name, value.dataType, value.options);
}
export function validateAction(value: any): void {
  switch (value?.kind) {
    case "addColumn":
      ddlObject(value, ["kind", "column"]);
      validateColumn(value.column);
      break;
    case "dropColumn":
      ddlObject(value, ["kind", "name"]);
      ddlIdentifier(value.name);
      break;
    case "renameColumn":
      ddlObject(value, ["kind", "name", "newName"]);
      ddlIdentifier(value.name);
      ddlIdentifier(value.newName);
      break;
    default:
      invalidDdl("Unknown ALTER action; exactly one action is required");
  }
}
/** Always applied to new nodes, even through direct fromJSON entry points. */
export function validateSchemaNode(node: any): void {
  assertSerializationVersion(node);
  switch (node?.type) {
    case "create_table":
      ddlObject(node, ["v", "type", "tableName", "columns", "ifNotExists"]);
      ddlIdentifier(node.tableName, true);
      booleanFlag(node.ifNotExists);
      if (!Array.isArray(node.columns) || !node.columns.length)
        invalidDdl("CREATE TABLE requires columns");
      node.columns.forEach(validateColumn);
      if (
        new Set(node.columns.map((c) => c.name.toLowerCase())).size !==
        node.columns.length
      )
        invalidDdl("Duplicate column name");
      if (node.columns.filter((c) => c.options.primaryKey).length > 1)
        invalidDdl("Only a single column primary key is supported");
      break;
    case "drop_table":
      ddlObject(node, ["v", "type", "tableName", "ifExists"]);
      ddlIdentifier(node.tableName, true);
      booleanFlag(node.ifExists);
      break;
    case "alter_table":
      ddlObject(node, ["v", "type", "tableName", "ifExists", "action"]);
      ddlIdentifier(node.tableName, true);
      booleanFlag(node.ifExists);
      validateAction(node.action);
      break;
    case "show_schemas":
      ddlObject(node, ["v", "type"]);
      break;
    case "show_tables":
      ddlObject(node, ["v", "type", "schema"]);
      if (node.schema !== undefined) ddlIdentifier(node.schema);
      break;
    case "describe_table":
    case "show_columns":
      ddlObject(node, ["v", "type", "tableName"]);
      ddlIdentifier(node.tableName, true);
      break;
    default:
      invalidDdl("Unknown schema node");
  }
}
