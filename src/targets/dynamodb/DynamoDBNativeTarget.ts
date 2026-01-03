import {
  BetweenCondition,
  BinaryCondition,
  ColumnComparisonCondition,
  Condition,
  InCondition,
  LikeCondition,
  LogicalCondition,
  NotCondition,
  NotInCondition,
  NullCondition,
} from "../../Condition";
import { ExpressionBase } from "../../Expression";
import { IQueryTarget } from "../../interfaces";
import { DeleteMutation, InsertMutation, UpdateMutation } from "../../Mutation";
import { SelectQuery } from "../../Query";
import {
  AttributeValue,
  DynamoDBBatchWriteItemInput,
  DynamoDBDeleteItemInput,
  DynamoDBInput,
  DynamoDBPutItemInput,
  DynamoDBQueryInput,
  DynamoDBScanInput,
  DynamoDBUpdateItemInput,
  ExpressionAttributeNameMap,
  ExpressionAttributeValueMap,
} from "./types";

/**
 * Options for DynamoDB Native Target
 */
export interface DynamoDBNativeTargetOptions {
  /**
   * Partition key attribute name(s). When specified, conditions on these
   * attributes will be placed in KeyConditionExpression for Query operations.
   * Without this, all operations default to Scan.
   */
  partitionKey?: string;

  /**
   * Sort key attribute name. When specified along with partitionKey,
   * conditions on this attribute will be placed in KeyConditionExpression.
   */
  sortKey?: string;

  /**
   * Index name for GSI or LSI queries
   */
  indexName?: string;

  /**
   * Use consistent reads (default: false)
   */
  consistentRead?: boolean;

  /**
   * Force Scan operation even if key conditions are present
   */
  forceScan?: boolean;
}

/**
 * Context for building DynamoDB expressions
 */
class ExpressionContext {
  private nameCounter = 0;
  private valueCounter = 0;
  private names: ExpressionAttributeNameMap = {};
  private values: ExpressionAttributeValueMap = {};
  private nameMap = new Map<string, string>(); // actual name -> placeholder
  private valueMap = new Map<string, string>(); // JSON value -> placeholder

  addName(name: string): string {
    // Check if we already have a placeholder for this name
    if (this.nameMap.has(name)) {
      return this.nameMap.get(name)!;
    }

    const placeholder = `#n${this.nameCounter++}`;
    this.names[placeholder] = name;
    this.nameMap.set(name, placeholder);
    return placeholder;
  }

  addValue(value: any): string {
    // Serialize for deduplication
    const key = JSON.stringify(value);
    if (this.valueMap.has(key)) {
      return this.valueMap.get(key)!;
    }

    const placeholder = `:v${this.valueCounter++}`;
    this.values[placeholder] = this.toAttributeValue(value);
    this.valueMap.set(key, placeholder);
    return placeholder;
  }

  getNames(): ExpressionAttributeNameMap | undefined {
    return Object.keys(this.names).length > 0 ? this.names : undefined;
  }

  getValues(): ExpressionAttributeValueMap | undefined {
    return Object.keys(this.values).length > 0 ? this.values : undefined;
  }

  private toAttributeValue(value: any): AttributeValue {
    if (value === null || value === undefined) {
      return { NULL: true };
    }
    if (typeof value === "string") {
      return { S: value };
    }
    if (typeof value === "number") {
      return { N: String(value) };
    }
    if (typeof value === "boolean") {
      return { BOOL: value };
    }
    if (value instanceof Date) {
      return { S: value.toISOString() };
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      return { B: value };
    }
    if (Array.isArray(value)) {
      // Check if it's a string set, number set, or list
      if (value.length > 0) {
        if (value.every((v) => typeof v === "string")) {
          return { SS: value };
        }
        if (value.every((v) => typeof v === "number")) {
          return { NS: value.map(String) };
        }
      }
      return { L: value.map((v) => this.toAttributeValue(v)) };
    }
    if (typeof value === "object") {
      const map: Record<string, AttributeValue> = {};
      for (const [k, v] of Object.entries(value)) {
        map[k] = this.toAttributeValue(v);
      }
      return { M: map };
    }
    return { S: String(value) };
  }
}

/**
 * DynamoDB Native Target
 *
 * Compiles ts-query queries to DynamoDB API input objects that can be used
 * directly with AWS SDK's Query, Scan, PutItem, UpdateItem, DeleteItem, etc.
 *
 * @example
 * ```typescript
 * const target = new DynamoDBNativeTarget({
 *   partitionKey: 'pk',
 *   sortKey: 'sk'
 * });
 *
 * const query = Q.select()
 *   .from("Users")
 *   .addField("id")
 *   .addField("name")
 *   .where(Cond.equal("pk", "USER#123"))
 *   .where(Cond.beginsWith("sk", "ORDER#"))
 *   .limit(10);
 *
 * const input = query.compile(target);
 * // Returns DynamoDBQueryInput with:
 * // - KeyConditionExpression
 * // - ProjectionExpression
 * // - ExpressionAttributeNames
 * // - ExpressionAttributeValues
 * ```
 */
export class DynamoDBNativeTarget implements IQueryTarget<DynamoDBInput> {
  constructor(private options: DynamoDBNativeTargetOptions = {}) {}

  compileSelect(query: SelectQuery): DynamoDBQueryInput | DynamoDBScanInput {
    this.validateSelect(query);

    const ctx = new ExpressionContext();
    const table = query.table;

    if (!table) {
      throw new Error("DynamoDB requires a table name");
    }

    const tableName = table.getTableName();
    const where = query.getWhere();

    // Separate key conditions from filter conditions
    const { keyConditions, filterConditions } = this.separateConditions(
      where,
      ctx
    );

    // Determine if we can use Query or must use Scan
    const canQuery =
      !this.options.forceScan &&
      this.options.partitionKey &&
      keyConditions.length > 0;

    // Build projection expression
    const fields = query.getFields();
    let projectionExpression: string | undefined;
    if (fields.length > 0) {
      projectionExpression = fields
        .map((f) => {
          const fieldName = this.extractColumnName(f.name);
          return ctx.addName(fieldName);
        })
        .join(", ");
    }

    // Build base input
    const baseInput = {
      TableName: tableName,
      ...(this.options.indexName && { IndexName: this.options.indexName }),
      ...(projectionExpression && { ProjectionExpression: projectionExpression }),
      ...(query.getLimit() !== undefined && { Limit: query.getLimit() }),
      ...(this.options.consistentRead && { ConsistentRead: true }),
      ExpressionAttributeNames: ctx.getNames(),
      ExpressionAttributeValues: ctx.getValues(),
    };

    if (canQuery) {
      // Build Query input
      const input: DynamoDBQueryInput = {
        ...baseInput,
        KeyConditionExpression: keyConditions.join(" AND "),
      };

      if (filterConditions.length > 0) {
        input.FilterExpression = filterConditions.join(" AND ");
      }

      // Handle ORDER BY for sort key
      const orderBy = query.getOrderBy();
      if (orderBy.length > 0) {
        // DynamoDB only supports ascending/descending on sort key
        input.ScanIndexForward = orderBy[0].direction === "ASC";
      }

      return this.cleanInput(input) as DynamoDBQueryInput;
    } else {
      // Build Scan input
      const allConditions = [...keyConditions, ...filterConditions];
      const input: DynamoDBScanInput = {
        ...baseInput,
        ...(allConditions.length > 0 && {
          FilterExpression: allConditions.join(" AND "),
        }),
      };

      return this.cleanInput(input) as DynamoDBScanInput;
    }
  }

  compileInsert(
    mutation: InsertMutation
  ): DynamoDBPutItemInput | DynamoDBBatchWriteItemInput {
    const table = mutation.getTable();
    const tableName = table.getTableName();
    const values = mutation.getValues();

    if (!values || values.length === 0) {
      throw new Error("INSERT requires values");
    }

    if (values.length === 1) {
      // Single item - use PutItem
      const item = this.toAttributeValueMap(values[0]);
      return {
        TableName: tableName,
        Item: item,
      };
    }

    // Multiple items - use BatchWriteItem
    const requests = values.map((row) => ({
      PutRequest: {
        Item: this.toAttributeValueMap(row),
      },
    }));

    return {
      RequestItems: {
        [tableName]: requests,
      },
    };
  }

  compileUpdate(mutation: UpdateMutation): DynamoDBUpdateItemInput {
    const ctx = new ExpressionContext();
    const table = mutation.getTable();
    const tableName = table.getTableName();
    const setValues = mutation.getSetValues();
    const where = mutation.getWhere();

    if (Object.keys(setValues).length === 0) {
      throw new Error("UPDATE requires at least one value to set");
    }

    if (where.length === 0) {
      throw new Error("DynamoDB UPDATE requires a WHERE clause with the key");
    }

    // Build SET clause
    const setExpressions = Object.entries(setValues).map(([key, value]) => {
      const namePlaceholder = ctx.addName(key);
      const valuePlaceholder = ctx.addValue(this.extractValue(value));
      return `${namePlaceholder} = ${valuePlaceholder}`;
    });

    // Extract key from WHERE conditions
    const key = this.extractKeyFromConditions(where);

    // Build condition expression from remaining conditions
    const conditionExpression = where
      .filter((c) => !this.isKeyCondition(c))
      .map((c) => this.compileCondition(c, ctx))
      .join(" AND ");

    const input: DynamoDBUpdateItemInput = {
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${setExpressions.join(", ")}`,
      ExpressionAttributeNames: ctx.getNames(),
      ExpressionAttributeValues: ctx.getValues(),
    };

    if (conditionExpression) {
      input.ConditionExpression = conditionExpression;
    }

    return this.cleanInput(input) as DynamoDBUpdateItemInput;
  }

  compileDelete(mutation: DeleteMutation): DynamoDBDeleteItemInput {
    const ctx = new ExpressionContext();
    const table = mutation.getTable();
    const tableName = table.getTableName();
    const where = mutation.getWhere();

    if (where.length === 0) {
      throw new Error("DynamoDB DELETE requires a WHERE clause with the key");
    }

    // Extract key from WHERE conditions
    const key = this.extractKeyFromConditions(where);

    // Build condition expression from remaining conditions
    const conditionExpression = where
      .filter((c) => !this.isKeyCondition(c))
      .map((c) => this.compileCondition(c, ctx))
      .join(" AND ");

    const input: DynamoDBDeleteItemInput = {
      TableName: tableName,
      Key: key,
      ExpressionAttributeNames: ctx.getNames(),
      ExpressionAttributeValues: ctx.getValues(),
    };

    if (conditionExpression) {
      input.ConditionExpression = conditionExpression;
    }

    return this.cleanInput(input) as DynamoDBDeleteItemInput;
  }

  /**
   * Validate that the query doesn't use unsupported features
   */
  private validateSelect(query: SelectQuery): void {
    if (query.getJoins().length > 0) {
      throw new Error("DynamoDB does not support JOIN operations");
    }
    if (query.getGroupBy().length > 0) {
      throw new Error("DynamoDB does not support GROUP BY");
    }
    if (query.getHaving().length > 0) {
      throw new Error("DynamoDB does not support HAVING");
    }
    if (query.getUnionQueries().length > 0) {
      throw new Error("DynamoDB does not support UNION");
    }
    if (query.getOffset() !== undefined) {
      throw new Error(
        "DynamoDB does not support OFFSET. Use ExclusiveStartKey for pagination."
      );
    }
  }

  /**
   * Separate conditions into key conditions and filter conditions
   */
  private separateConditions(
    conditions: Condition[],
    ctx: ExpressionContext
  ): { keyConditions: string[]; filterConditions: string[] } {
    const keyConditions: string[] = [];
    const filterConditions: string[] = [];

    for (const condition of conditions) {
      const columnName = this.getConditionColumnName(condition);
      const compiled = this.compileCondition(condition, ctx);

      if (
        columnName &&
        (columnName === this.options.partitionKey ||
          columnName === this.options.sortKey)
      ) {
        keyConditions.push(compiled);
      } else {
        filterConditions.push(compiled);
      }
    }

    return { keyConditions, filterConditions };
  }

  /**
   * Get the column name from a condition (if it's a simple condition)
   */
  private getConditionColumnName(condition: Condition): string | null {
    if (condition instanceof BinaryCondition) {
      return this.extractColumnName(condition.key);
    }
    if (condition instanceof BetweenCondition) {
      return this.extractColumnName(condition.key);
    }
    if (condition instanceof InCondition) {
      return this.extractColumnName(condition.key);
    }
    if (condition instanceof NullCondition) {
      return this.extractColumnName(condition.key);
    }
    if (condition instanceof LikeCondition) {
      return this.extractColumnName(condition.key);
    }
    return null;
  }

  /**
   * Check if a condition is a key condition (for UpdateItem/DeleteItem)
   */
  private isKeyCondition(condition: Condition): boolean {
    if (!(condition instanceof BinaryCondition)) return false;
    if (condition.operator !== "=") return false;

    const columnName = this.extractColumnName(condition.key);
    return (
      columnName === this.options.partitionKey ||
      columnName === this.options.sortKey
    );
  }

  /**
   * Extract key from equality conditions
   */
  private extractKeyFromConditions(
    conditions: Condition[]
  ): Record<string, AttributeValue> {
    const key: Record<string, AttributeValue> = {};

    for (const condition of conditions) {
      if (
        condition instanceof BinaryCondition &&
        condition.operator === "="
      ) {
        const columnName = this.extractColumnName(condition.key);
        if (
          columnName === this.options.partitionKey ||
          columnName === this.options.sortKey
        ) {
          key[columnName] = this.toSingleAttributeValue(
            this.extractValue(condition.value)
          );
        }
      }
    }

    return key;
  }

  /**
   * Compile a condition to DynamoDB expression syntax
   */
  private compileCondition(condition: Condition, ctx: ExpressionContext): string {
    if (condition instanceof BinaryCondition) {
      const keyName = this.extractColumnName(condition.key);
      const namePlaceholder = ctx.addName(keyName);
      const valuePlaceholder = ctx.addValue(this.extractValue(condition.value));
      return `${namePlaceholder} ${condition.operator} ${valuePlaceholder}`;
    }

    if (condition instanceof LogicalCondition) {
      const parts = condition.conditions.map((c) =>
        this.compileCondition(c, ctx)
      );
      return `(${parts.join(` ${condition.operator} `)})`;
    }

    if (condition instanceof BetweenCondition) {
      const keyName = this.extractColumnName(condition.key);
      const namePlaceholder = ctx.addName(keyName);
      const fromPlaceholder = ctx.addValue(this.extractValue(condition.from));
      const toPlaceholder = ctx.addValue(this.extractValue(condition.to));
      return `${namePlaceholder} BETWEEN ${fromPlaceholder} AND ${toPlaceholder}`;
    }

    if (condition instanceof InCondition) {
      const keyName = this.extractColumnName(condition.key);
      const namePlaceholder = ctx.addName(keyName);
      const valuePlaceholders = condition.values.map((v) =>
        ctx.addValue(this.extractValue(v))
      );
      return `${namePlaceholder} IN (${valuePlaceholders.join(", ")})`;
    }

    if (condition instanceof NotInCondition) {
      const keyName = this.extractColumnName(condition.key);
      const namePlaceholder = ctx.addName(keyName);
      const valuePlaceholders = condition.values.map((v) =>
        ctx.addValue(this.extractValue(v))
      );
      return `NOT (${namePlaceholder} IN (${valuePlaceholders.join(", ")}))`;
    }

    if (condition instanceof NullCondition) {
      const keyName = this.extractColumnName(condition.key);
      const namePlaceholder = ctx.addName(keyName);
      return condition.isNull
        ? `attribute_not_exists(${namePlaceholder})`
        : `attribute_exists(${namePlaceholder})`;
    }

    if (condition instanceof LikeCondition) {
      const keyName = this.extractColumnName(condition.key);
      const namePlaceholder = ctx.addName(keyName);
      const pattern = condition.pattern;
      const notPrefix = condition.isLike ? "" : "NOT ";

      if (pattern.startsWith("%") && pattern.endsWith("%")) {
        const searchTerm = pattern.slice(1, -1);
        const valuePlaceholder = ctx.addValue(searchTerm);
        return `${notPrefix}contains(${namePlaceholder}, ${valuePlaceholder})`;
      } else if (pattern.endsWith("%")) {
        const searchTerm = pattern.slice(0, -1);
        const valuePlaceholder = ctx.addValue(searchTerm);
        return `${notPrefix}begins_with(${namePlaceholder}, ${valuePlaceholder})`;
      } else if (pattern.startsWith("%")) {
        const searchTerm = pattern.slice(1);
        const valuePlaceholder = ctx.addValue(searchTerm);
        return `${notPrefix}contains(${namePlaceholder}, ${valuePlaceholder})`;
      } else {
        const valuePlaceholder = ctx.addValue(pattern);
        return `${namePlaceholder} ${condition.isLike ? "=" : "<>"} ${valuePlaceholder}`;
      }
    }

    if (condition instanceof ColumnComparisonCondition) {
      const leftName = this.extractColumnName(condition.leftKey);
      const rightName = this.extractColumnName(condition.rightKey);
      const leftPlaceholder = ctx.addName(leftName);
      const rightPlaceholder = ctx.addName(rightName);
      return `${leftPlaceholder} ${condition.operator} ${rightPlaceholder}`;
    }

    if (condition instanceof NotCondition) {
      return `NOT (${this.compileCondition(condition.condition, ctx)})`;
    }

    throw new Error(
      `Unsupported condition type: ${condition.constructor.name}`
    );
  }

  /**
   * Extract column name from an expression
   * Handles serialized format:
   * - Column: just the column name string like "id"
   */
  private extractColumnName(expr: ExpressionBase | any): string {
    if (typeof expr === "string") {
      return expr;
    }

    if (expr && typeof expr.serialize === "function") {
      const serialized = expr.serialize();
      // Column expressions serialize to just the column name
      // e.g., "id", "pk", "user.name"
      if (!serialized.startsWith("!") && !serialized.startsWith("{")) {
        return serialized;
      }
    }

    return String(expr);
  }

  /**
   * Extract raw value from an expression
   * Handles serialized formats:
   * - Value: "!!!" + JSON.stringify(value) like "!!!\"hello\""
   * - Raw: "!!" + JSON.stringify(value) + "!!" like "!!\"NULL\"!!"
   * - Date: "!D!" + timestamp + "!!" like "!D!1234567890!!"
   * - Column: just the column name (pass through)
   */
  private extractValue(expr: ExpressionBase | any): any {
    if (expr && typeof expr.serialize === "function") {
      const serialized = expr.serialize();

      // Value expression: starts with !!!
      if (serialized.startsWith("!!!")) {
        const jsonStr = serialized.substring(3);
        return JSON.parse(jsonStr);
      }

      // Date expression: starts with !D!
      if (serialized.startsWith("!D!")) {
        const timestamp = parseInt(
          serialized.substring(3, serialized.length - 2),
          10
        );
        return new Date(timestamp);
      }

      // Raw expression: starts and ends with !!
      if (serialized.startsWith("!!") && serialized.endsWith("!!")) {
        const jsonStr = serialized.substring(2, serialized.length - 2);
        return JSON.parse(jsonStr);
      }

      // Plain string (column name or literal)
      return serialized;
    }

    return expr;
  }

  /**
   * Convert a record to DynamoDB AttributeValue map
   */
  private toAttributeValueMap(
    row: Record<string, any>
  ): Record<string, AttributeValue> {
    const result: Record<string, AttributeValue> = {};
    for (const [key, value] of Object.entries(row)) {
      result[key] = this.toSingleAttributeValue(this.extractValue(value));
    }
    return result;
  }

  /**
   * Convert a single value to AttributeValue
   */
  private toSingleAttributeValue(value: any): AttributeValue {
    if (value === null || value === undefined) {
      return { NULL: true };
    }
    if (typeof value === "string") {
      return { S: value };
    }
    if (typeof value === "number") {
      return { N: String(value) };
    }
    if (typeof value === "boolean") {
      return { BOOL: value };
    }
    if (value instanceof Date) {
      return { S: value.toISOString() };
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      return { B: value };
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        if (value.every((v) => typeof v === "string")) {
          return { SS: value };
        }
        if (value.every((v) => typeof v === "number")) {
          return { NS: value.map(String) };
        }
      }
      return { L: value.map((v) => this.toSingleAttributeValue(v)) };
    }
    if (typeof value === "object") {
      const map: Record<string, AttributeValue> = {};
      for (const [k, v] of Object.entries(value)) {
        map[k] = this.toSingleAttributeValue(v);
      }
      return { M: map };
    }
    return { S: String(value) };
  }

  /**
   * Remove undefined values from input object
   */
  private cleanInput<T extends object>(input: T): T {
    const result: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }
}
