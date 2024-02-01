import { ISQLFlavor } from "./Flavor";

export interface ISequelizable {
  toSQL(flavor: ISQLFlavor): string;
}
export interface ISerializable {
  serialize(): string;
}

export type MetadataOperationType = "select" | "insert" | "update" | "delete";
export interface IMetadata {
  getTableNames(): string[];
  getOperationType(): MetadataOperationType;
}
