import { Condition, ConditionValue } from "./Condition";
import { ISQLFlavor } from "./Flavor";
import { Q, SelectQuery, Table } from "./Query";
import { MySQLFlavor } from "./flavors/mysql";
import {
  IMetadata,
  ISequelizable,
  ISerializable,
  MetadataOperationType,
} from "./interfaces";

export class CreateTableAsSelect
  implements ISerializable, ISequelizable, IMetadata
{
  constructor(private _tableName: string, private _select: SelectQuery) {}

  public clone(): this {
    return new (this.constructor as any)(this._tableName, this._select.clone());
  }

  getOperationType(): MetadataOperationType {
    return MetadataOperationType.CREATE_TABLE_AS;
  }

  getTableNames(): string[] {
    return [this._tableName, ...this._select.getTableNames()];
  }

  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    return `CREATE TABLE ${flavor.escapeTable(
      this._tableName
    )} AS ${this._select.toSQL(flavor)}`;
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  toJSON() {
    return {
      type: MetadataOperationType.CREATE_TABLE_AS,
      select: this._select.toJSON(),
      tableName: this._tableName,
    };
  }

  static fromJSON({ tableName, select }: any): CreateTableAsSelect {
    return new CreateTableAsSelect(tableName, SelectQuery.fromJSON(select));
  }
}
