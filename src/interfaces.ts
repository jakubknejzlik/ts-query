import { ISQLFlavor } from "./Flavor";

export interface ISequelizable {
  toSQL(flavor: ISQLFlavor): string;
}
export interface ISerializable {
  serialize(): string;
}

export enum MetadataOperationType {
  SELECT = "select",
  INSERT = "insert",
  UPDATE = "update",
  DELETE = "delete",
  CREATE_TABLE_AS = "ctas",
  CREATE_VIEW_AS = "cvas",
}
export enum OperationType {
  SELECT = "SelectQuery",
  INSERT = "InsertMutation",
  UPDATE = "UpdateMutation",
  DELETE = "DeleteMutation",
  CREATE_TABLE_AS = "ctas",
  CREATE_VIEW_AS = "cvas",
}

export interface IMetadata {
  getTableNames(): string[];
  getOperationType(): MetadataOperationType;
}
