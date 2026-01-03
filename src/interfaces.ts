import { ISQLFlavor } from "./Flavor";
import { DeleteMutation, InsertMutation, UpdateMutation } from "./Mutation";
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

/**
 * Generic query target interface for compiling queries to different backends.
 * TOutput is the type returned by the target (e.g., string for SQL, object for DynamoDB params)
 */
export interface IQueryTarget<TOutput> {
  /**
   * Compile a SELECT query to the target format
   */
  compileSelect(query: SelectQuery): TOutput;

  /**
   * Compile an INSERT mutation to the target format
   */
  compileInsert(mutation: InsertMutation): TOutput;

  /**
   * Compile an UPDATE mutation to the target format
   */
  compileUpdate(mutation: UpdateMutation): TOutput;

  /**
   * Compile a DELETE mutation to the target format
   */
  compileDelete(mutation: DeleteMutation): TOutput;
}

/**
 * Interface for objects that can be compiled to a target format
 */
export interface ICompilable {
  compile<T>(target: IQueryTarget<T>): T;
}
export interface ISerializableOptions {
  compress?: boolean;
}
export interface ISerializable {
  serialize(opts?: ISerializableOptions): string;
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
