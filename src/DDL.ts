// Load the dependency-free base before bindings enters the existing Query cycle.
import { SchemaNode } from "./SchemaNode";
import { toSQLWithBindings, SQLWithBindings } from "./bindings";
import { ISQLFlavor } from "./Flavor";
import { MySQLFlavor } from "./flavors/mysql";
import { MetadataOperationType, OperationType } from "./interfaces";
import {
  FlavorCapabilities,
  UnsupportedOperationError,
  requireCapability,
} from "./capabilities";
import {
  ColumnDefinition,
  ColumnOptions,
  ColumnType,
  DdlLiteral,
  columnDefinition,
  ddlIdentifier,
  ddlObject,
  invalidDdl,
} from "./ddl-types";
import {
  booleanFlag,
  validateAction,
  validateSchemaNode,
} from "./schema-validation";

export type AlterTableAction =
  | { readonly kind: "addColumn"; readonly column: ColumnDefinition }
  | { readonly kind: "dropColumn"; readonly name: string }
  | {
      readonly kind: "renameColumn";
      readonly name: string;
      readonly newName: string;
    };

abstract class DdlNode extends SchemaNode {
  toSQLWithBindings(flavor?: ISQLFlavor): SQLWithBindings {
    return toSQLWithBindings(this, flavor);
  }
}
function requireOption(supported: boolean, option: string): void {
  if (!supported) throw new UnsupportedOperationError(option);
}
/** Names have already passed strict validation; escape each component independently. */
function identifierSQL(name: string, caps: FlavorCapabilities): string {
  const quote = ["mysql", "sqlite"].includes(caps.dialect) ? "`" : '"';
  return name
    .split(".")
    .map((part) => `${quote}${part}${quote}`)
    .join(".");
}
function literalSQL(value: DdlLiteral, caps: FlavorCapabilities): string {
  if (value.kind === "null") return "NULL";
  if (value.kind === "boolean") return value.value ? "TRUE" : "FALSE";
  if (value.kind === "number") return String(value.value);
  // MySQL's backslash handling depends on sql_mode. Reject this case rather than
  // change a literal's meaning under NO_BACKSLASH_ESCAPES.
  requireOption(
    caps.dialect !== "mysql" || !value.value.includes("\\"),
    "default.string.backslash"
  );
  // Explicit escape strings keep PostgreSQL defaults independent of its
  // standard_conforming_strings session setting.
  if (caps.dialect === "postgres" && value.value.includes("\\"))
    return `E'${value.value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  return `'${value.value.replace(/'/g, "''")}'`;
}
const typeSQL = {
  duckdb: {
    boolean: "BOOLEAN",
    int32: "INTEGER",
    int64: "BIGINT",
    float64: "DOUBLE",
    string: "VARCHAR",
    date: "DATE",
    timestamp: "TIMESTAMP",
    timestamptz: "TIMESTAMPTZ",
    json: "JSON",
    uuid: "UUID",
  },
  postgres: {
    boolean: "BOOLEAN",
    int32: "INTEGER",
    int64: "BIGINT",
    float64: "DOUBLE PRECISION",
    string: "TEXT",
    date: "DATE",
    timestamp: "TIMESTAMP",
    timestamptz: "TIMESTAMPTZ",
    json: "JSON",
    uuid: "UUID",
  },
  sqlite: {
    boolean: "BOOLEAN",
    int32: "INTEGER",
    int64: "INTEGER",
    float64: "REAL",
    string: "TEXT",
  },
  mysql: {
    boolean: "BOOLEAN",
    int32: "INT",
    int64: "BIGINT",
    float64: "DOUBLE",
    string: "TEXT",
    date: "DATE",
    timestamp: "DATETIME",
    json: "JSON",
  },
};
function columnSQL(
  column: ColumnDefinition,
  flavor: ISQLFlavor,
  caps: FlavorCapabilities,
  adding: boolean
): string {
  const { name, dataType, options } = column;
  requireOption(caps.types.includes(dataType.kind), `type.${dataType.kind}`);
  const supportedOptions = adding
    ? caps.addColumnOptions
    : caps.createColumnOptions;
  for (const key of Object.keys(options)) {
    // An explicit false primaryKey still requests no constraint.
    if (key === "primaryKey" && options.primaryKey === false) continue;
    requireOption(
      supportedOptions.includes(key as any),
      `${adding ? "addColumn" : "CreateTable"}.${key}`
    );
  }
  if (options.primaryKey)
    requireOption(
      caps.primaryKeyTypes.includes(dataType.kind),
      `primaryKey.${dataType.kind}`
    );
  if (options.default !== undefined)
    requireOption(
      caps.defaultTypes.includes(dataType.kind),
      `default.${dataType.kind}`
    );
  if (adding && caps.notNullAddRequiresDefault && options.nullable === false)
    requireOption(
      options.default !== undefined && options.default.kind !== "null",
      "addColumn.notNullRequiresDefault"
    );
  let sqlType: string;
  if (dataType.kind === "decimal") {
    // MySQL's scale limit is lower than the portable precision bound.
    requireOption(
      caps.dialect !== "mysql" || dataType.scale <= 30,
      "decimal.scale"
    );
    sqlType = `DECIMAL(${dataType.precision},${dataType.scale})`;
  } else sqlType = typeSQL[caps.dialect]?.[dataType.kind];
  requireOption(!!sqlType, `type.${dataType.kind}`);
  return (
    `${identifierSQL(name, caps)} ${sqlType}` +
    (options.nullable === false || options.primaryKey
      ? " NOT NULL"
      : options.nullable === true
      ? " NULL"
      : "") +
    (options.primaryKey ? " PRIMARY KEY" : "") +
    (options.default !== undefined
      ? ` DEFAULT ${literalSQL(options.default, caps)}`
      : "")
  );
}

export class CreateTable extends DdlNode {
  private readonly columns: readonly ColumnDefinition[];
  private readonly flag: boolean;
  constructor(
    private readonly tableName: string,
    options: { ifNotExists?: boolean } = {},
    columns: readonly ColumnDefinition[] = []
  ) {
    super();
    ddlIdentifier(tableName, true);
    ddlObject(options, ["ifNotExists"]);
    this.flag = options.ifNotExists === undefined ? false : options.ifNotExists;
    booleanFlag(this.flag);
    this.columns = Object.freeze(
      columns.map((c) => columnDefinition(c.name, c.dataType, c.options))
    );
  }
  column(
    name: string,
    dataType: ColumnType,
    options: ColumnOptions = {}
  ): CreateTable {
    const result = new CreateTable(this.tableName, { ifNotExists: this.flag }, [
      ...this.columns,
      columnDefinition(name, dataType, options),
    ]);
    validateSchemaNode(result.toJSON());
    return result;
  }
  ifNotExists(value = true): CreateTable {
    return new CreateTable(
      this.tableName,
      { ifNotExists: value },
      this.columns
    );
  }
  clone(): CreateTable {
    return new CreateTable(
      this.tableName,
      { ifNotExists: this.flag },
      this.columns
    );
  }
  getTableName(): string {
    return this.tableName;
  }
  getTableNames(): string[] {
    return [this.tableName];
  }
  getColumns(): readonly ColumnDefinition[] {
    return this.columns;
  }
  getIfNotExists(): boolean {
    return this.flag;
  }
  getOperationType(): MetadataOperationType {
    return MetadataOperationType.CREATE_TABLE;
  }
  toJSON() {
    return {
      type: OperationType.CREATE_TABLE,
      tableName: this.tableName,
      columns: this.columns,
      ifNotExists: this.flag,
    };
  }
  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    validateSchemaNode(this.toJSON());
    const caps = requireCapability(flavor, "CreateTable");
    if (this.flag)
      requireOption(caps.createIfNotExists, "CreateTable.ifNotExists");
    return `CREATE TABLE ${this.flag ? "IF NOT EXISTS " : ""}${identifierSQL(
      this.tableName,
      caps
    )} (${this.columns
      .map((c) => columnSQL(c, flavor, caps, false))
      .join(", ")})`;
  }
  static fromJSON(node: any): CreateTable {
    validateSchemaNode(node);
    if (node.type !== OperationType.CREATE_TABLE)
      invalidDdl("Expected CreateTable");
    return new CreateTable(
      node.tableName,
      { ifNotExists: node.ifNotExists },
      node.columns
    );
  }
}
export class DropTable extends DdlNode {
  private readonly flag: boolean;
  constructor(
    private readonly tableName: string,
    options: { ifExists?: boolean } = {}
  ) {
    super();
    ddlIdentifier(tableName, true);
    ddlObject(options, ["ifExists"]);
    this.flag = options.ifExists === undefined ? false : options.ifExists;
    booleanFlag(this.flag);
  }
  ifExists(value = true): DropTable {
    return new DropTable(this.tableName, { ifExists: value });
  }
  clone(): DropTable {
    return new DropTable(this.tableName, { ifExists: this.flag });
  }
  getTableName(): string {
    return this.tableName;
  }
  getTableNames(): string[] {
    return [this.tableName];
  }
  getIfExists(): boolean {
    return this.flag;
  }
  getOperationType(): MetadataOperationType {
    return MetadataOperationType.DROP_TABLE;
  }
  toJSON() {
    return {
      type: OperationType.DROP_TABLE,
      tableName: this.tableName,
      ifExists: this.flag,
    };
  }
  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    validateSchemaNode(this.toJSON());
    const caps = requireCapability(flavor, "DropTable");
    if (this.flag) requireOption(caps.dropIfExists, "DropTable.ifExists");
    return `DROP TABLE ${this.flag ? "IF EXISTS " : ""}${identifierSQL(
      this.tableName,
      caps
    )}`;
  }
  static fromJSON(node: any): DropTable {
    validateSchemaNode(node);
    if (node.type !== OperationType.DROP_TABLE)
      invalidDdl("Expected DropTable");
    return new DropTable(node.tableName, { ifExists: node.ifExists });
  }
}
export class AlterTable extends DdlNode {
  private readonly flag: boolean;
  private readonly action?: AlterTableAction;
  constructor(
    private readonly tableName: string,
    options: { ifExists?: boolean } = {},
    action?: AlterTableAction
  ) {
    super();
    ddlIdentifier(tableName, true);
    ddlObject(options, ["ifExists"]);
    this.flag = options.ifExists === undefined ? false : options.ifExists;
    booleanFlag(this.flag);
    if (action !== undefined) {
      validateAction(action);
      this.action = Object.freeze(
        action.kind === "addColumn"
          ? {
              kind: action.kind,
              column: columnDefinition(
                action.column.name,
                action.column.dataType,
                action.column.options
              ),
            }
          : { ...action }
      );
    }
  }
  private withAction(action: AlterTableAction): AlterTable {
    if (this.action)
      invalidDdl(
        "ALTER TABLE accepts one action; create another node for the next action"
      );
    return new AlterTable(this.tableName, { ifExists: this.flag }, action);
  }
  addColumn(
    name: string,
    dataType: ColumnType,
    options: ColumnOptions = {}
  ): AlterTable {
    return this.withAction({
      kind: "addColumn",
      column: columnDefinition(name, dataType, options),
    });
  }
  dropColumn(name: string): AlterTable {
    return this.withAction({ kind: "dropColumn", name });
  }
  renameColumn(name: string, newName: string): AlterTable {
    return this.withAction({ kind: "renameColumn", name, newName });
  }
  ifExists(value = true): AlterTable {
    return new AlterTable(this.tableName, { ifExists: value }, this.action);
  }
  clone(): AlterTable {
    return new AlterTable(this.tableName, { ifExists: this.flag }, this.action);
  }
  getTableName(): string {
    return this.tableName;
  }
  getTableNames(): string[] {
    return [this.tableName];
  }
  getIfExists(): boolean {
    return this.flag;
  }
  getAction(): AlterTableAction | undefined {
    return this.action;
  }
  getOperationType(): MetadataOperationType {
    return MetadataOperationType.ALTER_TABLE;
  }
  toJSON() {
    return {
      type: OperationType.ALTER_TABLE,
      tableName: this.tableName,
      ifExists: this.flag,
      action: this.action,
    };
  }
  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    validateSchemaNode(this.toJSON());
    const action = this.action!;
    const caps = requireCapability(flavor, action.kind);
    if (this.flag) requireOption(caps.alterIfExists, "AlterTable.ifExists");
    const prefix = `ALTER TABLE ${this.flag ? "IF EXISTS " : ""}${identifierSQL(
      this.tableName,
      caps
    )} `;
    if (action.kind === "addColumn")
      return (
        prefix + `ADD COLUMN ${columnSQL(action.column, flavor, caps, true)}`
      );
    if (action.kind === "dropColumn")
      return prefix + `DROP COLUMN ${identifierSQL(action.name, caps)}`;
    return (
      prefix +
      `RENAME COLUMN ${identifierSQL(action.name, caps)} TO ${identifierSQL(
        action.newName,
        caps
      )}`
    );
  }
  static fromJSON(node: any): AlterTable {
    validateSchemaNode(node);
    if (node.type !== OperationType.ALTER_TABLE)
      invalidDdl("Expected AlterTable");
    return new AlterTable(
      node.tableName,
      { ifExists: node.ifExists },
      node.action
    );
  }
}
