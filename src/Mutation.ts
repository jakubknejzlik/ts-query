import { Condition } from "./Condition";
import { ISQLFlavor } from "./Flavor";
import { Table } from "./Query";
import { MySQLFlavor } from "./flavors/mysql";
import {
  IMetadata,
  ISequelizable,
  ISerializable,
  MetadataOperationType,
  OperationType,
} from "./interfaces";

type RowRecord = Record<string, any>;

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
  protected _values: RowRecord[] = [];

  public getOperationType(): MetadataOperationType {
    return MetadataOperationType.INSERT;
  }

  public clone(): this {
    const clone = super.clone();
    clone._values = [...this._values];
    return clone;
  }

  values(values: RowRecord[]): this {
    const clone = this.clone();
    clone._values = [...clone._values, ...values];
    return clone;
  }

  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    if (this._values.length === 0) throw new Error("No values to insert");

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

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  toJSON() {
    return {
      type: OperationType.INSERT,
      table: this._table.toJSON(),
      values: this._values,
    };
  }

  static fromJSON({ table, values }: any): InsertMutation {
    const insertMutation = new InsertMutation(table.source, table.alias);
    insertMutation._values = values;
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

  set(values: RowRecord): this {
    const clone = this.clone();
    clone._values = { ...clone._values, ...values };
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
        ([key, value]) =>
          `${flavor.escapeColumn(key)} = ${flavor.escapeValue(value)}`
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
    return {
      type: OperationType.UPDATE,
      table: this._table.toJSON(),
      values: this._values,
      where: this._where.map((condition) => condition.toJSON()),
    };
  }

  static fromJSON({ table, values, where }: any): UpdateMutation {
    const updateMutation = new UpdateMutation(table.source, table.alias);
    updateMutation._values = values;
    updateMutation._where = where.map((condition: any) =>
      Condition.fromJSON(condition)
    );
    return updateMutation;
  }
}
