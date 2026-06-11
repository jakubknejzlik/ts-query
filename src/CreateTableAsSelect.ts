import { ISQLFlavor } from "./Flavor";
import { SelectQuery } from "./Query";
import { compressString } from "./compression";
import { MySQLFlavor } from "./flavors/mysql";
import {
  IMetadata,
  ISequelizable,
  ISerializable,
  ISerializableOptions,
  MetadataOperationType,
  OperationType,
} from "./interfaces";

export class CreateTableAsSelect
  implements ISerializable, ISequelizable, IMetadata
{
  constructor(
    private _tableName: string,
    private _select: SelectQuery,
    private _orReplace: boolean = false,
    private _ifNotExists: boolean = false
  ) {
    if (this._orReplace && this._ifNotExists) {
      throw new Error(
        "CreateTableAsSelect: orReplace and ifNotExists are mutually exclusive"
      );
    }
  }

  public clone(): this {
    return new (this.constructor as any)(
      this._tableName,
      this._select.clone(),
      this._orReplace,
      this._ifNotExists
    );
  }

  getOperationType(): MetadataOperationType {
    return MetadataOperationType.CREATE_TABLE_AS;
  }

  getTableNames(): string[] {
    return [this._tableName, ...this._select.getTableNames()];
  }

  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    const orReplaceStr = this._orReplace ? "OR REPLACE " : "";
    const ifNotExistsStr = this._ifNotExists ? "IF NOT EXISTS " : "";
    return `CREATE ${orReplaceStr}TABLE ${ifNotExistsStr}${flavor.escapeTable(
      this._tableName
    )} AS ${this._select.toSQL(flavor)}`;
  }

  // serialization
  serialize(opts: ISerializableOptions = { compress: false }): string {
    const json = JSON.stringify(this.toJSON());
    return opts.compress ? compressString(json) : json;
  }

  toJSON() {
    return {
      type: OperationType.CREATE_TABLE_AS,
      select: this._select.toJSON(),
      tableName: this._tableName,
      orReplace: this._orReplace,
      ifNotExists: this._ifNotExists,
    };
  }

  static fromJSON({
    tableName,
    select,
    orReplace,
    ifNotExists,
  }: any): CreateTableAsSelect {
    return new CreateTableAsSelect(
      tableName,
      SelectQuery.fromJSON(select),
      orReplace,
      ifNotExists
    );
  }

  getTableName(): string {
    return this._tableName;
  }
  getSelect(): SelectQuery {
    return this._select;
  }
  getOrReplace(): boolean {
    return this._orReplace;
  }
  getIfNotExists(): boolean {
    return this._ifNotExists;
  }
}
