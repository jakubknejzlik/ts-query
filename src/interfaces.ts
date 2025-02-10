import { ISQLFlavor } from "./Flavor";
import {
  DeleteMutation,
  InsertMutation,
  MutationBase,
  UpdateMutation,
} from "./Mutation";
import { SelectQuery, TableSource } from "./Query";

export interface ISequelizableOptions {
  transformTable?: (table: string) => TableSource;
  transformSelectQuery?: (table: SelectQuery) => SelectQuery;
  transformInsertMutation?: (table: InsertMutation) => InsertMutation;
  transformUpdateMutation?: (table: UpdateMutation) => UpdateMutation;
  transformDeleteMutation?: (table: DeleteMutation) => DeleteMutation;
}

export interface ISequelizable {
  toSQL(flavor: ISQLFlavor, options?: ISequelizableOptions): string;
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
