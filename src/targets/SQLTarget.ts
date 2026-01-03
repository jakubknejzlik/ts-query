import { ISQLFlavor } from "../Flavor";
import { IQueryTarget, ISequelizableOptions } from "../interfaces";
import { DeleteMutation, InsertMutation, UpdateMutation } from "../Mutation";
import { SelectQuery } from "../Query";

/**
 * SQL Target - wraps existing ISQLFlavor system for backward compatibility.
 * This target compiles queries to SQL strings using the provided SQL flavor.
 */
export class SQLTarget implements IQueryTarget<string> {
  constructor(
    private flavor: ISQLFlavor,
    private options?: ISequelizableOptions
  ) {}

  /**
   * Get the underlying SQL flavor
   */
  public getFlavor(): ISQLFlavor {
    return this.flavor;
  }

  /**
   * Get the sequelizable options
   */
  public getOptions(): ISequelizableOptions | undefined {
    return this.options;
  }

  /**
   * Create a new SQLTarget with different options
   */
  public withOptions(options: ISequelizableOptions): SQLTarget {
    return new SQLTarget(this.flavor, options);
  }

  compileSelect(query: SelectQuery): string {
    return query.toSQL(this.flavor, this.options);
  }

  compileInsert(mutation: InsertMutation): string {
    return mutation.toSQL(this.flavor, this.options);
  }

  compileUpdate(mutation: UpdateMutation): string {
    return mutation.toSQL(this.flavor, this.options);
  }

  compileDelete(mutation: DeleteMutation): string {
    return mutation.toSQL(this.flavor, this.options);
  }
}
