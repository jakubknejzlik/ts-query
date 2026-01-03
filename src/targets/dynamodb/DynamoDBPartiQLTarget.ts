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

/**
 * DynamoDB PartiQL Target
 *
 * Compiles ts-query queries to PartiQL statements that can be executed
 * against DynamoDB using the ExecuteStatement API.
 *
 * PartiQL is an SQL-compatible query language supported by DynamoDB.
 * See: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ql-reference.html
 *
 * Limitations:
 * - No JOIN support (DynamoDB doesn't support joins)
 * - No GROUP BY / HAVING support
 * - ORDER BY only works on sort key within a partition
 * - OFFSET is not supported (use ExclusiveStartKey for pagination)
 * - LIKE patterns are limited
 *
 * @example
 * ```typescript
 * const target = new DynamoDBPartiQLTarget();
 * const query = Q.select().from("Users").where(Cond.equal("id", "123"));
 * const partiql = query.compile(target);
 * // Returns: "SELECT * FROM Users WHERE id = '123'"
 * ```
 */
export class DynamoDBPartiQLTarget implements IQueryTarget<string> {
  compileSelect(query: SelectQuery): string {
    this.validateSelect(query);

    // Build SELECT clause
    const fields = query.getFields();
    const columns =
      fields.length > 0
        ? fields
            .map((f) => {
              const fieldName = this.compileExpression(f.name);
              return f.alias ? `${fieldName} AS ${f.alias}` : fieldName;
            })
            .join(", ")
        : "*";

    // Build FROM clause
    const table = query.table;
    if (!table) {
      throw new Error("DynamoDB PartiQL requires a table name");
    }
    const tableName = table.getTableName();
    const tableAlias = table.alias ? ` AS ${table.alias}` : "";

    let sql = `SELECT ${columns} FROM ${tableName}${tableAlias}`;

    // Build WHERE clause
    const where = query.getWhere();
    if (where.length > 0) {
      const whereClause = where
        .map((c) => this.compileCondition(c))
        .join(" AND ");
      sql += ` WHERE ${whereClause}`;
    }

    // Handle ORDER BY (limited in DynamoDB - only works on sort key)
    const orderBy = query.getOrderBy();
    if (orderBy.length > 0) {
      const orderClause = orderBy
        .map((o) => `${this.compileExpression(o.field)} ${o.direction}`)
        .join(", ");
      sql += ` ORDER BY ${orderClause}`;
    }

    // Handle LIMIT (PartiQL doesn't support OFFSET)
    const limit = query.getLimit();
    if (limit !== undefined) {
      sql += ` LIMIT ${limit}`;
    }

    return sql;
  }

  compileInsert(mutation: InsertMutation): string {
    const table = mutation.getTable();
    const tableName = table.getTableName();
    const values = mutation.getValues();

    if (!values || values.length === 0) {
      const selectWithColumns = mutation.getSelectWithColumns();
      if (selectWithColumns) {
        throw new Error(
          "DynamoDB PartiQL does not support INSERT ... SELECT"
        );
      }
      throw new Error("INSERT requires values");
    }

    // PartiQL INSERT syntax: INSERT INTO table VALUE {'attr': value, ...}
    // For multiple items, we return multiple statements
    if (values.length === 1) {
      const item = this.compileInsertItem(values[0]);
      return `INSERT INTO ${tableName} VALUE ${item}`;
    }

    // Multiple items - return as array of statements (caller can use BatchExecuteStatement)
    return values
      .map((row) => {
        const item = this.compileInsertItem(row);
        return `INSERT INTO ${tableName} VALUE ${item}`;
      })
      .join(";\n");
  }

  compileUpdate(mutation: UpdateMutation): string {
    const table = mutation.getTable();
    const tableName = table.getTableName();
    const setValues = mutation.getSetValues();
    const where = mutation.getWhere();

    if (Object.keys(setValues).length === 0) {
      throw new Error("UPDATE requires at least one value to set");
    }

    // Build SET clause
    const setClause = Object.entries(setValues)
      .map(([key, value]) => `${key} = ${this.compileValue(value)}`)
      .join(", ");

    let sql = `UPDATE ${tableName} SET ${setClause}`;

    // WHERE clause (required for DynamoDB - must include key)
    if (where.length === 0) {
      throw new Error(
        "DynamoDB UPDATE requires a WHERE clause with the primary key"
      );
    }
    const whereClause = where
      .map((c) => this.compileCondition(c))
      .join(" AND ");
    sql += ` WHERE ${whereClause}`;

    return sql;
  }

  compileDelete(mutation: DeleteMutation): string {
    const table = mutation.getTable();
    const tableName = table.getTableName();
    const where = mutation.getWhere();

    let sql = `DELETE FROM ${tableName}`;

    // WHERE clause (required for DynamoDB - must include key)
    if (where.length === 0) {
      throw new Error(
        "DynamoDB DELETE requires a WHERE clause with the primary key"
      );
    }
    const whereClause = where
      .map((c) => this.compileCondition(c))
      .join(" AND ");
    sql += ` WHERE ${whereClause}`;

    return sql;
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
   * Compile a condition to PartiQL
   */
  private compileCondition(condition: Condition): string {
    if (condition instanceof BinaryCondition) {
      const key = this.compileExpression(condition.key);
      const value = this.compileValue(condition.value);
      return `${key} ${condition.operator} ${value}`;
    }

    if (condition instanceof LogicalCondition) {
      const conditions = condition.conditions
        .map((c) => this.compileCondition(c))
        .join(` ${condition.operator} `);
      return `(${conditions})`;
    }

    if (condition instanceof BetweenCondition) {
      const key = this.compileExpression(condition.key);
      const from = this.compileValue(condition.from);
      const to = this.compileValue(condition.to);
      return `${key} BETWEEN ${from} AND ${to}`;
    }

    if (condition instanceof InCondition) {
      const key = this.compileExpression(condition.key);
      const values = condition.values
        .map((v) => this.compileValue(v))
        .join(", ");
      return `${key} IN (${values})`;
    }

    if (condition instanceof NotInCondition) {
      const key = this.compileExpression(condition.key);
      const values = condition.values
        .map((v) => this.compileValue(v))
        .join(", ");
      return `NOT (${key} IN (${values}))`;
    }

    if (condition instanceof NullCondition) {
      const key = this.compileExpression(condition.key);
      // PartiQL uses attribute_exists / attribute_not_exists or IS MISSING
      return condition.isNull
        ? `${key} IS MISSING`
        : `${key} IS NOT MISSING`;
    }

    if (condition instanceof LikeCondition) {
      const key = this.compileExpression(condition.key);
      // PartiQL supports contains() for substring matching
      // LIKE 'foo%' -> begins_with(key, 'foo')
      // LIKE '%foo%' -> contains(key, 'foo')
      // LIKE '%foo' -> not directly supported, use contains as approximation
      const pattern = condition.pattern;
      const notPrefix = condition.isLike ? "" : "NOT ";

      if (pattern.startsWith("%") && pattern.endsWith("%")) {
        const searchTerm = pattern.slice(1, -1);
        return `${notPrefix}contains(${key}, '${this.escapeString(searchTerm)}')`;
      } else if (pattern.endsWith("%")) {
        const searchTerm = pattern.slice(0, -1);
        return `${notPrefix}begins_with(${key}, '${this.escapeString(searchTerm)}')`;
      } else if (pattern.startsWith("%")) {
        // No direct support for ends_with, use contains
        const searchTerm = pattern.slice(1);
        return `${notPrefix}contains(${key}, '${this.escapeString(searchTerm)}')`;
      } else {
        // Exact match
        return `${key} ${condition.isLike ? "=" : "<>"} '${this.escapeString(pattern)}'`;
      }
    }

    if (condition instanceof ColumnComparisonCondition) {
      const left = this.compileExpression(condition.leftKey);
      const right = this.compileExpression(condition.rightKey);
      return `${left} ${condition.operator} ${right}`;
    }

    if (condition instanceof NotCondition) {
      return `NOT (${this.compileCondition(condition.condition)})`;
    }

    throw new Error(`Unsupported condition type: ${condition.constructor.name}`);
  }

  /**
   * Compile an expression to PartiQL (typically a column reference)
   */
  private compileExpression(expr: ExpressionBase | any): string {
    if (typeof expr === "string") {
      // Check if it's a raw SQL expression (contains operators or functions)
      if (
        expr.includes("(") ||
        expr.includes("+") ||
        expr.includes("-") ||
        expr.includes("*") ||
        expr.includes("/")
      ) {
        return expr;
      }
      // Column name
      return expr;
    }

    if (expr && typeof expr.serialize === "function") {
      const serialized = expr.serialize();
      return this.parseSerializedExpression(serialized, false);
    }

    return String(expr);
  }

  /**
   * Compile a value for PartiQL (typically a literal value)
   */
  private compileValue(value: ExpressionBase | any): string {
    if (value && typeof value.serialize === "function") {
      const serialized = value.serialize();
      return this.parseSerializedExpression(serialized, true);
    }

    return this.formatValue(value);
  }

  /**
   * Parse a serialized expression string
   * Formats:
   * - Column: just the column name string like "id"
   * - Value: "!!!" + JSON.stringify(value) like "!!!\"hello\""
   * - Raw: "!!" + JSON.stringify(value) + "!!" like "!!\"NULL\"!!"
   * - Date: "!D!" + timestamp + "!!" like "!D!1234567890!!"
   * - Function: JSON object with type "function"
   * - Operation: JSON object with type "operation"
   */
  private parseSerializedExpression(serialized: string, asValue: boolean): string {
    // Value expression: starts with !!!
    if (serialized.startsWith("!!!")) {
      const jsonStr = serialized.substring(3);
      const value = JSON.parse(jsonStr);
      return this.formatValue(value);
    }

    // Date expression: starts with !D!
    if (serialized.startsWith("!D!")) {
      const timestamp = parseInt(serialized.substring(3, serialized.length - 2), 10);
      const date = new Date(timestamp);
      return `'${date.toISOString()}'`;
    }

    // Raw expression: starts and ends with !!
    if (serialized.startsWith("!!") && serialized.endsWith("!!")) {
      const jsonStr = serialized.substring(2, serialized.length - 2);
      return JSON.parse(jsonStr);
    }

    // Try to parse as JSON (for function/operation expressions)
    if (serialized.startsWith("{")) {
      try {
        const parsed = JSON.parse(serialized);
        if (parsed.type === "function") {
          return this.compileFunction(parsed);
        }
        if (parsed.type === "operation") {
          return this.compileOperation(parsed);
        }
      } catch {
        // Not valid JSON, treat as column name
      }
    }

    // Plain string - treat as column name or value
    if (asValue) {
      return this.formatValue(serialized);
    }
    return serialized;
  }

  /**
   * Format a JavaScript value for PartiQL
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return "NULL";
    }
    if (typeof value === "string") {
      return `'${this.escapeString(value)}'`;
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "boolean") {
      return value ? "TRUE" : "FALSE";
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (Array.isArray(value)) {
      return `[${value.map((v) => this.formatValue(v)).join(", ")}]`;
    }
    if (typeof value === "object") {
      // Map/object - use PartiQL map literal syntax
      const entries = Object.entries(value)
        .map(([k, v]) => `'${k}': ${this.formatValue(v)}`)
        .join(", ");
      return `{${entries}}`;
    }
    return String(value);
  }

  /**
   * Escape a string for PartiQL (single quotes)
   */
  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Compile an INSERT item to PartiQL map syntax
   */
  private compileInsertItem(row: Record<string, any>): string {
    const entries = Object.entries(row)
      .map(([key, value]) => `'${key}': ${this.compileValue(value)}`)
      .join(", ");
    return `{${entries}}`;
  }

  /**
   * Compile a function expression
   */
  private compileFunction(fn: { name: string; value: any[] }): string {
    const args = fn.value.map((v) => {
      if (typeof v === "string") {
        try {
          const parsed = JSON.parse(v);
          if (parsed.type === "column") return parsed.value;
          if (parsed.type === "value") return this.formatValue(parsed.value);
          return v;
        } catch {
          return v;
        }
      }
      return this.formatValue(v);
    });

    // Map common SQL functions to PartiQL equivalents
    switch (fn.name.toUpperCase()) {
      case "COUNT":
      case "SUM":
      case "AVG":
      case "MIN":
      case "MAX":
        // These work in PartiQL for aggregate queries
        return `${fn.name}(${args.join(", ")})`;
      case "SIZE":
        return `size(${args[0]})`;
      case "ATTRIBUTE_EXISTS":
        return `attribute_exists(${args[0]})`;
      case "ATTRIBUTE_NOT_EXISTS":
        return `attribute_not_exists(${args[0]})`;
      case "BEGINS_WITH":
        return `begins_with(${args[0]}, ${args[1]})`;
      case "CONTAINS":
        return `contains(${args[0]}, ${args[1]})`;
      default:
        return `${fn.name}(${args.join(", ")})`;
    }
  }

  /**
   * Compile an operation expression
   */
  private compileOperation(op: {
    operator: string;
    left: any;
    right: any;
  }): string {
    const left = this.compileExpression(op.left);
    const right = this.compileExpression(op.right);
    return `(${left} ${op.operator} ${right})`;
  }
}
