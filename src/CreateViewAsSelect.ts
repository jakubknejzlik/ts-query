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

export class CreateViewAsSelect
  implements ISerializable, ISequelizable, IMetadata
{
  constructor(
    private _viewName: string,
    private _select: SelectQuery,
    private _orReplace: boolean = false
  ) {}

  public clone(): this {
    return new (this.constructor as any)(
      this._viewName,
      this._select.clone(),
      this._orReplace
    );
  }

  getOperationType(): MetadataOperationType {
    return MetadataOperationType.CREATE_VIEW_AS;
  }

  getTableNames(): string[] {
    return [this._viewName, ...this._select.getTableNames()];
  }

  toSQL(flavor: ISQLFlavor = new MySQLFlavor()): string {
    const orReplaceStr = this._orReplace ? "OR REPLACE " : "";
    return `CREATE ${orReplaceStr}VIEW ${flavor.escapeTable(
      this._viewName
    )} AS ${this._select.toSQL(flavor)}`;
  }

  // serialization
  serialize(opts: ISerializableOptions = { compress: false }): string {
    const json = JSON.stringify(this.toJSON());
    return opts.compress ? compressString(json) : json;
  }

  toJSON() {
    return {
      type: OperationType.CREATE_VIEW_AS,
      select: this._select.toJSON(),
      viewName: this._viewName,
      orReplace: this._orReplace,
    };
  }

  static fromJSON({ viewName, select, orReplace }: any): CreateViewAsSelect {
    return new CreateViewAsSelect(
      viewName,
      SelectQuery.fromJSON(select),
      orReplace
    );
  }

  getViewName(): string {
    return this._viewName;
  }
  getSelect(): SelectQuery {
    return this._select;
  }
}
