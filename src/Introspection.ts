// Load the dependency-free base before bindings enters the existing Query cycle.
import { SchemaNode } from "./SchemaNode";
import { toSQLWithBindings, SQLWithBindings } from "./bindings";
import { ISQLFlavor } from "./Flavor";
import { MySQLFlavor } from "./flavors/mysql";
import { requireCapability } from "./capabilities";
import { ddlIdentifier, ddlObject, invalidDdl } from "./ddl-types";
import { MetadataOperationType, OperationType } from "./interfaces";
import { validateSchemaNode } from "./schema-validation";

abstract class IntrospectionNode extends SchemaNode {
  toSQLWithBindings(flavor?: ISQLFlavor): SQLWithBindings {
    return toSQLWithBindings(this, flavor);
  }
}
export class ShowSchemas extends IntrospectionNode {
  clone(): ShowSchemas {
    return new ShowSchemas();
  }
  getTableNames(): string[] {
    return [];
  }
  getOperationType(): MetadataOperationType {
    return MetadataOperationType.SHOW_SCHEMAS;
  }
  toJSON() {
    return { type: OperationType.SHOW_SCHEMAS };
  }
  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    requireCapability(flavor, "ShowSchemas");
    return "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name";
  }
  static fromJSON(node: any): ShowSchemas {
    validateSchemaNode(node);
    if (node.type !== OperationType.SHOW_SCHEMAS)
      invalidDdl("Expected ShowSchemas");
    return new ShowSchemas();
  }
}
export class ShowTables extends IntrospectionNode {
  private readonly schema?: string;
  constructor(options: { schema?: string } = {}) {
    super();
    ddlObject(options, ["schema"]);
    if (options.schema !== undefined) ddlIdentifier(options.schema);
    this.schema = options.schema;
  }
  clone(): ShowTables {
    return new ShowTables({ schema: this.schema });
  }
  getSchema(): string | undefined {
    return this.schema;
  }
  getTableNames(): string[] {
    return [];
  }
  getOperationType(): MetadataOperationType {
    return MetadataOperationType.SHOW_TABLES;
  }
  toJSON() {
    return { type: OperationType.SHOW_TABLES, schema: this.schema };
  }
  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    validateSchemaNode(this.toJSON());
    requireCapability(flavor, "ShowTables");
    return (
      "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_catalog = current_database() AND table_schema = " +
      (this.schema === undefined
        ? "current_schema()"
        : flavor.escapeValue(this.schema)) +
      " ORDER BY table_name"
    );
  }
  static fromJSON(node: any): ShowTables {
    validateSchemaNode(node);
    if (node.type !== OperationType.SHOW_TABLES)
      invalidDdl("Expected ShowTables");
    return new ShowTables({ schema: node.schema });
  }
}
abstract class TableIntrospection extends IntrospectionNode {
  constructor(private readonly tableName: string) {
    super();
    ddlIdentifier(tableName, true);
  }
  getTableName(): string {
    return this.tableName;
  }
  getTableNames(): string[] {
    return [this.tableName];
  }
  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    validateSchemaNode(this.toJSON());
    requireCapability(flavor, this.toJSON().type);
    const parts = this.tableName.split(".");
    const name = parts.pop()!;
    const schema = parts.pop();
    return (
      "SELECT column_name, data_type, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_catalog = current_database() AND table_schema = " +
      (schema === undefined ? "current_schema()" : flavor.escapeValue(schema)) +
      ` AND table_name = ${flavor.escapeValue(name)} ORDER BY ordinal_position`
    );
  }
}
export class DescribeTable extends TableIntrospection {
  clone(): DescribeTable {
    return new DescribeTable(this.getTableName());
  }
  getOperationType(): MetadataOperationType {
    return MetadataOperationType.DESCRIBE_TABLE;
  }
  toJSON() {
    return {
      type: OperationType.DESCRIBE_TABLE,
      tableName: this.getTableName(),
    };
  }
  static fromJSON(node: any): DescribeTable {
    validateSchemaNode(node);
    if (node.type !== OperationType.DESCRIBE_TABLE)
      invalidDdl("Expected DescribeTable");
    return new DescribeTable(node.tableName);
  }
}
export class ShowColumns extends TableIntrospection {
  clone(): ShowColumns {
    return new ShowColumns(this.getTableName());
  }
  getOperationType(): MetadataOperationType {
    return MetadataOperationType.SHOW_COLUMNS;
  }
  toJSON() {
    return { type: OperationType.SHOW_COLUMNS, tableName: this.getTableName() };
  }
  static fromJSON(node: any): ShowColumns {
    validateSchemaNode(node);
    if (node.type !== OperationType.SHOW_COLUMNS)
      invalidDdl("Expected ShowColumns");
    return new ShowColumns(node.tableName);
  }
}
