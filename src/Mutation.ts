import { Condition } from "./Condition";
import { Expression, ExpressionValue } from "./Expression";
import { ISQLFlavor } from "./Flavor";
import { Q, SelectQuery, Table } from "./Query";
import { MySQLFlavor } from "./flavors/mysql";
import {
  IMetadata,
  ISequelizable,
  ISerializable,
  MetadataOperationType,
  OperationType,
} from "./interfaces";

type RowRecord = Record<string, Expression>;
type RowRecordInput = Record<string, Expression | any>;

export class MutationBase {
  protected _table: Table;

  constructor(table: string, alias?: string) {
    this._table = new Table(table, alias);
  }

  public getTableNames(): string[] {
    return [this._table.getTableName()];
  }

  public clone(): this {
    const clone = new (this.constructor as any)();
    clone._table = this._table.clone();
    return clone;
  }

  static deserialize(json: string) {
    const parsed = JSON.parse(json);
    switch (parsed.type) {
      case OperationType.DELETE:
        return DeleteMutation.fromJSON(parsed);
      case OperationType.INSERT:
        return InsertMutation.fromJSON(parsed);
      case OperationType.UPDATE:
        return UpdateMutation.fromJSON(parsed);
      default:
        throw new Error("Unknown mutation type");
    }
  }
}

export class DeleteMutation
  extends MutationBase
  implements ISerializable, ISequelizable, IMetadata
{
  protected _where: Condition[] = [];

  public getOperationType(): MetadataOperationType {
    return MetadataOperationType.DELETE;
  }

  public clone(): this {
    const clone = super.clone();
    clone._where = [...this._where];
    return clone;
  }

  where(condition: Condition): this {
    const clone = this.clone();
    clone._where.push(condition);
    return clone;
  }

  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    let sql = `DELETE FROM ${this._table.toSQL(flavor)}`;
    if (this._where.length) {
      sql += ` WHERE ${this._where
        .map((condition) => condition.toSQL(flavor))
        .join(" AND ")}`;
    }
    return sql;
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  toJSON() {
    return {
      type: OperationType.DELETE,
      table: this._table.toJSON(),
      where: this._where.map((condition) => condition.toJSON()),
    };
  }

  static fromJSON({ table, where }: any): DeleteMutation {
    const deleteMutation = new DeleteMutation(table.source, table.alias);
    deleteMutation._where = where.map((condition: any) =>
      Condition.fromJSON(condition)
    );
    return deleteMutation;
  }
}

export class InsertMutation
  extends MutationBase
  implements ISerializable, ISequelizable, IMetadata
{
  protected _values?: RowRecord[];
  protected _selectWithColumns: [SelectQuery, string[] | undefined];

  public getOperationType(): MetadataOperationType {
    return MetadataOperationType.INSERT;
  }

  public clone(): this {
    const clone = super.clone();
    clone._values = this._values && [...this._values];
    return clone;
  }

  values(values: RowRecordInput[]): this {
    const clone = this.clone();
    if (clone._selectWithColumns) throw new Error("select already set");
    clone._values = [...(clone._values ?? []), ...values];
    return clone;
  }

  select(query: SelectQuery, columns?: string[]): this {
    const clone = this.clone();
    if (clone._values) throw new Error("values already set");
    clone._selectWithColumns = [query, columns];
    return clone;
  }

  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    if (this._values) {
      return `INSERT INTO ${this._table.toSQL(flavor)} (${Object.keys(
        this._values[0]
      )
        .map((k) => flavor.escapeColumn(k))
        .join(", ")}) VALUES ${this._values
        .map(
          (value) =>
            `(${Object.values(value)
              .map((v) => flavor.escapeValue(v))
              .join(", ")})`
        )
        .join(", ")}`;
    }
    if (this._selectWithColumns) {
      const [query, columns] = this._selectWithColumns;
      return `INSERT INTO ${this._table.toSQL(flavor)}${
        columns
          ? ` (${columns.map((k) => flavor.escapeColumn(k)).join(", ")})`
          : ""
      } ${query.toSQL(flavor)}`;
    }
    throw new Error("values or select must be set for insert query");
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  toJSON() {
    return {
      type: OperationType.INSERT,
      table: this._table.toJSON(),
      values: this._values,
      select: this._selectWithColumns && [
        this._selectWithColumns[0].toJSON(),
        this._selectWithColumns[1],
      ],
    };
  }

  static fromJSON({ table, values, select }: any): InsertMutation {
    const insertMutation = new InsertMutation(table.source, table.alias);
    insertMutation._values = values;
    if (select) {
      insertMutation._selectWithColumns = [
        SelectQuery.fromJSON(select[0]),
        select[1],
      ];
    }
    return insertMutation;
  }
}

export class UpdateMutation
  extends MutationBase
  implements ISerializable, ISequelizable, IMetadata
{
  protected _values: RowRecord = {};
  protected _where: Condition[] = [];

  public getOperationType(): MetadataOperationType {
    return MetadataOperationType.UPDATE;
  }

  public clone(): this {
    const clone = super.clone();
    clone._values = { ...this._values };
    clone._where = [...this._where];
    return clone;
  }

  set(values: RowRecordInput): this {
    const clone = this.clone();
    const _values = {};
    for (const [key, value] of Object.entries(values)) {
      _values[key] = value instanceof Expression ? value : Q.exprValue(value);
    }
    clone._values = { ...clone._values, ..._values };
    return clone;
  }

  where(condition: Condition): this {
    const clone = this.clone();
    clone._where.push(condition);
    return clone;
  }

  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    if (!this._values) throw new Error("No values to update");

    let sql = `UPDATE ${this._table.toSQL(flavor)} SET ${Object.entries(
      this._values
    )
      .map(
        ([key, value]) => `${flavor.escapeColumn(key)} = ${value.toSQL(flavor)}`
      )
      .join(", ")}`;
    if (this._where.length) {
      sql += ` WHERE ${this._where
        .map((condition) => condition.toSQL(flavor))
        .join(" AND ")}`;
    }
    return sql;
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  toJSON() {
    const _values = {};
    for (const [key, value] of Object.entries(this._values)) {
      _values[key] = value.serialize();
    }
    return {
      type: OperationType.UPDATE,
      table: this._table.toJSON(),
      values: _values,
      where: this._where.map((condition) => condition.toJSON()),
    };
  }

  static fromJSON({ table, values, where }: any): UpdateMutation {
    const updateMutation = new UpdateMutation(table.source, table.alias);
    const _values = {};
    for (const [key, value] of Object.entries(values)) {
      _values[key] = Expression.deserialize(value as ExpressionValue);
    }
    updateMutation._values = _values;
    updateMutation._where = where.map((condition: any) =>
      Condition.fromJSON(condition)
    );
    return updateMutation;
  }
}
