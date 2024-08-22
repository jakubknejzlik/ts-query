import { Condition } from "./Condition";
import { CreateTableAsSelect } from "./CreateTableAsSelect";
import { CreateViewAsSelect } from "./CreateViewAsSelect";
import {
  Expression,
  ExpressionBase,
  ExpressionRawValue,
  ExpressionValue,
  RawExpression,
} from "./Expression";
import { ISQLFlavor } from "./Flavor";
import { AWSTimestreamFlavor } from "./flavors/aws-timestream";
import { MySQLFlavor } from "./flavors/mysql";
import { SQLiteFlavor } from "./flavors/sqlite";
import { Fn } from "./Function";
import {
  IMetadata,
  ISequelizable,
  ISerializable,
  MetadataOperationType,
  OperationType,
} from "./interfaces";
import { DeleteMutation, InsertMutation, UpdateMutation } from "./Mutation";

const flavors = {
  mysql: new MySQLFlavor(),
  awsTimestream: new AWSTimestreamFlavor(),
  sqlite: new SQLiteFlavor(),
};

type TableSource = string | SelectQuery;

export class Table implements ISequelizable, ISerializable {
  constructor(public source: TableSource, public alias?: string) {}
  public clone(): this {
    return new (this.constructor as any)(this.source, this.alias);
  }
  public getTableName(): string | undefined {
    if (typeof this.source === "string") {
      return this.source;
    }
    return this.source.table?.getTableName();
  }

  toSQL(flavor: ISQLFlavor): string {
    const isSelect = isSelectQuery(this.source);
    const tableName = escapeTable(this.source, flavor);
    let alias = this.alias;
    if (isSelect && !alias) alias = "t";
    return `${tableName}${alias ? ` AS ${flavor.escapeColumn(alias)}` : ""}`;
  }
  toJSON(): any {
    return {
      type: "Table",
      source: this.source,
      alias: this.alias,
    };
  }
  static fromJSON(json: any): Table {
    if (
      typeof json.source === "object" &&
      json.source["type"] === OperationType.SELECT
    ) {
      return new Table(SelectQuery.fromJSON(json.source), json.alias);
    }
    return new Table(json.source, json.alias);
  }
  serialize(): string {
    return JSON.stringify(this.toJSON());
  }
  static deserialize(json: string): Table {
    return Table.fromJSON(JSON.parse(json));
  }
}

function isSelectQuery(table: TableSource): table is SelectQuery {
  return table instanceof SelectQuery;
}
export const escapeTable = (table: TableSource, flavor: ISQLFlavor): string => {
  if (isSelectQuery(table)) return `(${table.toSQL(flavor)})`;
  return flavor.escapeTable(table);
};

export class QueryBase implements ISequelizable, IMetadata {
  protected _tables: Table[] = [];
  protected _joins?: Join[] = [];

  public getOperationType(): MetadataOperationType {
    return MetadataOperationType.SELECT;
  }

  // @ts-ignore
  public get table(): Table | undefined {
    if (this._tables.length === 0) return undefined;
    return this._tables[0];
  }
  public get tables(): Table[] {
    return this._tables;
  }
  public from(table: TableSource, alias?: string): this {
    const clone = this.clone();
    if (isSelectQuery(table)) {
      clone._tables = [new Table(table.clone(), alias)];
    } else {
      clone._tables = [new Table(table, alias)];
    }
    return clone;
  }

  public getTableNames(): string[] {
    return [
      ...this._tables.map((t) => t.getTableName()).filter((x) => x),
      ...this._joins.map((j) => j.getTableName()).filter((x) => x),
    ];
  }

  /**
   * join function to join tables with all join types
   */
  join(
    table: Table,
    condition?: Condition,
    type: "INNER" | "LEFT" | "RIGHT" | "FULL" = "INNER"
  ): this {
    const clone = this.clone();
    clone._joins.push(new Join(table, condition, type));
    return clone;
  }
  innerJoin(table: Table, condition: Condition): this {
    return this.join(table, condition, "INNER");
  }
  leftJoin(table: Table, condition: Condition): this {
    return this.join(table, condition, "LEFT");
  }
  rightJoin(table: Table, condition: Condition): this {
    return this.join(table, condition, "RIGHT");
  }
  fullJoin(table: Table, condition: Condition): this {
    return this.join(table, condition, "FULL");
  }

  public clone(): this {
    const clone = new (this.constructor as any)();
    clone._tables = [...this._tables.map((t) => t.clone())];
    clone._joins = [...this._joins.map((j) => j.clone())];
    return clone;
  }

  toSQL(flavor: ISQLFlavor): string {
    return this.tables.length > 0
      ? `FROM ${this.tables.map((table) => table.toSQL(flavor)).join(",")}`
      : "";
  }
}

class Join {
  protected _type: "INNER" | "LEFT" | "RIGHT" | "FULL";
  protected _table: Table;
  protected _condition?: Condition;

  constructor(
    table: Table,
    condition?: Condition,
    type: "INNER" | "LEFT" | "RIGHT" | "FULL" = "INNER"
  ) {
    this._table = table;
    this._condition = condition;
    this._type = type;
  }

  public clone(): this {
    const clone = new (this.constructor as any)(
      this._table,
      this._condition,
      this._type
    );
    return clone;
  }

  public getTableName(): string {
    return this._table.getTableName();
  }

  toSQL(flavor: ISQLFlavor): string {
    return `${this._type} JOIN ${this._table.toSQL(flavor)}${
      this._condition ? ` ON ${this._condition.toSQL(flavor)}` : ""
    }`;
  }

  toJSON(): any {
    return {
      type: "Join",
      table: this._table.toJSON(),
      condition: this._condition?.toJSON(),
      joinType: this._type,
    };
  }
  static fromJSON(json: any): Join {
    return new Join(
      Table.fromJSON(json.table),
      json.condition && Condition.fromJSON(json.condition),
      json.joinType
    );
  }
  serialize(): string {
    return JSON.stringify(this.toJSON());
  }
  static deserialize(json: string): Join {
    return Join.fromJSON(JSON.parse(json));
  }
}

interface SelectField {
  name: ExpressionValue;
  alias?: string;
}

interface Order {
  field: ExpressionBase;
  direction: "ASC" | "DESC";
}

class SelectBaseQuery extends QueryBase {
  protected _fields: SelectField[] = [];

  public clone(): this {
    const clone = super.clone();
    clone._fields = [...this._fields];
    return clone;
  }

  // @deprecated please use addField
  field(name: ExpressionValue, alias?: string): this {
    return this.addFields([{ name, alias }]);
  }
  // add single field
  addField(name: ExpressionValue, alias?: string): this {
    return this.addFields([{ name, alias }]);
  }
  // add multiple fields
  addFields(fields: SelectField[]): this {
    const clone = this.clone();
    clone._fields.push(
      ...fields.map((f) => ({
        name: Expression.deserialize(f.name),
        alias: f.alias,
      }))
    );
    return clone;
  }
  removeFields(): this {
    return this.fields([]);
  }
  // reset fields
  fields(fields: SelectField[]): this {
    const clone = this.clone();
    clone._fields = [];
    return clone.addFields(fields);
  }

  toSQL(flavor: ISQLFlavor): string {
    const columns =
      this._fields.length > 0
        ? this._fields
            .map(
              (f) =>
                `${Expression.deserialize(f.name).toSQL(flavor)}${
                  f.alias ? ` AS ${flavor.escapeColumn(f.alias)}` : ""
                }`
            )
            .join(", ")
        : "*";
    return `SELECT ${columns} ${super.toSQL(flavor)}`;
  }
}

export enum UnionType {
  UNION = "UNION",
  UNION_ALL = "UNION ALL",
}

export class SelectQuery extends SelectBaseQuery implements ISerializable {
  protected _where: Condition[] = [];
  protected _having: Condition[] = [];
  protected _limit?: number;
  protected _offset?: number;
  protected _orderBy: Order[] = [];
  protected _groupBy: ExpressionBase[] = [];
  protected _unionQueries: { query: SelectQuery; type: UnionType }[] = [];

  public clone(): this {
    const clone = super.clone();
    clone._where = [...this._where];
    clone._having = [...this._having];
    clone._limit = this._limit;
    clone._offset = this._offset;
    clone._orderBy = [...this._orderBy];
    clone._groupBy = [...this._groupBy];
    clone._unionQueries = this._unionQueries.map((u) => ({
      query: u.query.clone(),
      type: u.type,
    }));
    return clone;
  }

  where(condition: Condition): this {
    const clone = this.clone();
    clone._where.push(condition);
    return clone;
  }
  removeWhere(): this {
    const clone = this.clone();
    clone._where = [];
    return clone;
  }
  having(condition: Condition): this {
    const clone = this.clone();
    clone._having.push(condition);
    return clone;
  }
  removeHaving(): this {
    const clone = this.clone();
    clone._having = [];
    return clone;
  }

  public getLimit(): number | undefined {
    return this._limit;
  }
  clearLimit(): this {
    const clone = this.clone();
    clone._limit = undefined;
    return clone;
  }
  limit(limit: number): this {
    const clone = this.clone();
    clone._limit = limit;
    return clone;
  }

  public getOffset(): number | undefined {
    return this._offset;
  }
  clearOffset(): this {
    const clone = this.clone();
    clone._offset = undefined;
    return clone;
  }
  offset(offset: number): SelectQuery {
    const clone = this.clone();
    clone._offset = offset;
    return clone;
  }
  public getOrderBy(): Order[] {
    return this._orderBy;
  }
  orderBy(field: ExpressionValue, direction: "ASC" | "DESC" = "ASC"): this {
    const clone = this.clone();
    clone._orderBy.push({
      field: Expression.deserialize(field),
      direction,
    });
    return clone;
  }
  removeOrderBy(): this {
    const clone = this.clone();
    clone._orderBy = [];
    return clone;
  }
  public getGroupBy(): ExpressionBase[] {
    return this._groupBy;
  }
  groupBy(...field: ExpressionValue[]): this {
    const clone = this.clone();
    clone._groupBy.push(...field.map((f) => Expression.deserialize(f)));
    return clone;
  }
  removeGroupBy(): this {
    const clone = this.clone();
    clone._groupBy = [];
    return clone;
  }
  public union(query: SelectQuery, type: UnionType = UnionType.UNION): this {
    const clone = this.clone();
    clone._unionQueries.push({ query, type });
    return clone;
  }

  public getTableNames(): string[] {
    return Array.from(
      new Set([
        ...super.getTableNames(),
        ...this._unionQueries.reduce(
          (acc, u) => [...acc, ...u.query.getTableNames()],
          [] as string[]
        ),
      ])
    );
  }

  toSQL(flavor: ISQLFlavor = flavors.mysql): string {
    let sql = super.toSQL(flavor);

    if (this._joins?.length > 0) {
      sql += ` ${this._joins.map((j) => j.toSQL(flavor)).join(" ")}`;
    }
    if (this._where.length > 0) {
      sql += ` WHERE ${this._where.map((w) => w.toSQL(flavor)).join(" AND ")}`;
    }
    if (this._groupBy.length > 0) {
      sql += ` GROUP BY ${this._groupBy
        .map((c) => c.toSQL(flavor))
        .join(", ")}`;
    }
    if (this._having.length > 0) {
      sql += ` HAVING ${this._having
        .map((w) => w.toSQL(flavor))
        .join(" AND ")}`;
    }
    if (this._orderBy.length > 0) {
      sql += ` ORDER BY ${this._orderBy
        .map((o) => `${o.field.toSQL(flavor)} ${o.direction}`)
        .join(", ")}`;
    }

    sql += flavor.escapeLimitAndOffset(this._limit, this._offset);

    this._unionQueries.forEach((unionQuery) => {
      sql = flavor.escapeUnion(
        unionQuery.type,
        sql,
        unionQuery.query.toSQL(flavor)
      );
    });
    return sql;
  }

  // serialization
  serialize(): string {
    return JSON.stringify(this.toJSON());
  }
  toJSON(): any {
    return {
      type: OperationType.SELECT,
      tables: this._tables.map((table) =>
        typeof table === "string" ? table : table.toJSON()
      ),
      unionQueries:
        this._unionQueries.length > 0
          ? this._unionQueries.map((u) => ({
              type: u.type,
              query: u.query.toJSON(),
            }))
          : undefined,
      joins:
        this._joins.length > 0
          ? this._joins.map((join) => join.toJSON())
          : undefined,
      fields:
        this._fields.length > 0
          ? this._fields.map((f) => ({
              name: Expression.deserialize(f.name).serialize(),
              alias: f.alias,
            }))
          : undefined,
      where:
        this._where.length > 0
          ? this._where.map((condition) => condition.toJSON())
          : undefined,
      having:
        this._having.length > 0
          ? this._having.map((condition) => condition.toJSON())
          : undefined,
      orderBy:
        this._orderBy.length > 0
          ? this._orderBy.map((o) => ({
              field: o.field.serialize(),
              direction: o.direction,
            }))
          : undefined,
      groupBy:
        this._groupBy.length > 0
          ? this._groupBy.map((c) => c.serialize())
          : undefined,
      limit: this._limit,
      offset: this._offset,
    };
  }
  static fromJSON(json: any): SelectQuery {
    const query = new SelectQuery();
    query._tables = json.tables.map((table: any) => {
      return Table.fromJSON(table);
    });
    query._unionQueries = (json.unionQueries || []).map((u: any) => ({
      type: u.type,
      query: SelectQuery.fromJSON(u.query),
    }));
    query._joins = (json.joins || []).map((joinJson: any) =>
      Join.fromJSON(joinJson)
    );
    query._fields = (json.fields ?? []).map((field: any) => ({
      name: Expression.deserialize(field.name),
      alias: field.alias,
    }));
    query._where = (json.where || []).map((conditionJson: any) =>
      Condition.fromJSON(conditionJson)
    );
    query._having = (json.having || []).map((conditionJson: any) =>
      Condition.fromJSON(conditionJson)
    );
    query._limit = json.limit;
    query._offset = json.offset;
    query._orderBy = (json.orderBy ?? []).map((o: any) => ({
      field: Expression.deserialize(o.field),
      direction: o.direction,
    }));
    query._groupBy = (json.groupBy ?? []).map((v) => Expression.deserialize(v));
    return query;
  }
}

const deserialize = (json: string) => {
  try {
    const parsed = JSON.parse(json);
    switch (parsed.type as OperationType) {
      case OperationType.SELECT:
        return SelectQuery.fromJSON(parsed);
      case OperationType.DELETE:
        return DeleteMutation.fromJSON(parsed);
      case OperationType.INSERT:
        return InsertMutation.fromJSON(parsed);
      case OperationType.UPDATE:
        return UpdateMutation.fromJSON(parsed);
      case OperationType.CREATE_TABLE_AS:
        return CreateTableAsSelect.fromJSON(parsed);
      case OperationType.CREATE_VIEW_AS:
        return CreateViewAsSelect.fromJSON(parsed);
      default:
        throw new Error("Unknown mutation type");
    }
  } catch (e) {
    throw new Error(`Error parsing query: ${(e as Error).message}`);
  }
};

export const Query = {
  table: (name: string, alias?: string) => new Table(name, alias),
  select: () => {
    return new SelectQuery();
  },
  stats: () => new SelectQuery().from("(?)", "t"),
  delete: (from: string, alias?: string) => new DeleteMutation(from, alias),
  update: (table: string, alias?: string) => new UpdateMutation(table, alias),
  insert: (into: string) => new InsertMutation(into),
  createTableAs: (table: string, select: SelectQuery) =>
    new CreateTableAsSelect(table, select),
  createViewAs: (table: string, select: SelectQuery) =>
    new CreateViewAsSelect(table, select),
  createOrReplaceViewAs: (table: string, select: SelectQuery) =>
    new CreateViewAsSelect(table, select, true),
  deserialize,
  flavors,
  null: () => new RawExpression("NULL"),
  raw: (val: ExpressionValue) => new RawExpression(val),
  expr: (val: ExpressionValue) => ExpressionBase.deserialize(val),
  exprValue: (val: ExpressionValue) => ExpressionBase.deserializeValue(val),
  value: (val: ExpressionValue) => ExpressionBase.deserializeValue(val),
  column: (col: ExpressionRawValue) => Expression.escapeColumn(col),
  S: (literals: string | readonly string[]) => {
    return Fn.string(`${literals}`);
  },
};

// for shorter syntax
export { Query as Q };
