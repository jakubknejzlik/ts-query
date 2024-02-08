import { ISQLFlavor } from "./Flavor";

export interface ISequelizable {
  toSQL(flavor: ISQLFlavor): string;
}
export interface ISerializable {
  serialize(): string;
}

export enum MetadataOperationType {
  SELECT = "Select",
  INSERT = "Insert",
  UPDATE = "Update",
  DELETE = "Delete",
  CREATE_TABLE_AS = "CTAS",
  CREATE_VIEW_AS = "CVAS",
}

export interface IMetadata {
  getTableNames(): string[];
  getOperationType(): MetadataOperationType;
}
