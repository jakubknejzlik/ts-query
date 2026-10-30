import {
  Condition,
  BinaryCondition,
  LogicalCondition,
  BetweenCondition,
  InCondition,
  NotInCondition,
  ExistsCondition,
  NotExistsCondition,
  NullCondition,
  LikeCondition,
  ColumnComparisonCondition,
  NotCondition,
} from "./Condition";
import {
  Expression,
  ExpressionBase,
  ValueExpression,
  RawExpression,
  FunctionExpression,
  OperationExpression,
} from "./Expression";
import { SelectQuery, Table } from "./Query";
import { InsertMutation, UpdateMutation, DeleteMutation } from "./Mutation";
import { CreateTableAsSelect } from "./CreateTableAsSelect";
import { CreateViewAsSelect } from "./CreateViewAsSelect";
import { MetadataOperationType } from "./interfaces";

export type GuardQuery =
  | SelectQuery
  | InsertMutation
  | UpdateMutation
  | DeleteMutation
  | CreateTableAsSelect
  | CreateViewAsSelect;
export type MutationKind = "insert" | "update" | "delete";
export interface QueryVisitor {
  onTable?(name: string, alias: string | undefined, depth: number): void;
  onColumn?(table: string | undefined, name: string): void;
  onFunction?(name: string): void;
  /** Called for nested SELECTs, including union operands; root depth is zero. */
  onSubquery?(depth: number): void;
  onUnion?(): void;
  onRaw?(): void;
  onMutation?(kind: MutationKind): void;
}
export interface QueryColumn {
  table?: string;
  name: string;
}
export interface QuerySummary {
  tables: string[];
  columns: QueryColumn[];
  functions: string[];
  maxDepth: number;
  hasRaw: boolean;
  hasUnion: boolean;
  kind: MetadataOperationType;
}

/** Visit occurrences in AST order, without modifying the query or applying transforms. */
export function walk(query: GuardQuery, visitor: QueryVisitor): void {
  const column = (name: string) => {
    const parts = name.split(".");
    visitor.onColumn?.(
      parts.length > 1 ? parts.slice(0, -1).join(".") : undefined,
      parts[parts.length - 1]
    );
  };
  const expression = (value: any, depth: number): void => {
    if (value == null || value instanceof Date) return;
    if (
      !(value instanceof ExpressionBase) &&
      !(value instanceof Condition) &&
      !(value instanceof SelectQuery)
    ) {
      value = ExpressionBase.deserialize(value);
    }
    if (value instanceof SelectQuery) {
      visit(value, depth + 1);
      return;
    }
    if (value instanceof Condition) {
      condition(value, depth);
      return;
    }
    if (value instanceof RawExpression) {
      visitor.onRaw?.();
      return;
    }
    if (value instanceof ValueExpression) {
      if (
        value.value instanceof ExpressionBase ||
        value.value instanceof Condition
      )
        expression(value.value, depth);
      return;
    }
    if (
      value instanceof FunctionExpression ||
      value instanceof OperationExpression
    ) {
      if (value instanceof FunctionExpression) visitor.onFunction?.(value.name);
      value.value.forEach((arg) => expression(arg, depth));
      return;
    }
    if (value instanceof Expression) {
      if (
        value.value instanceof ExpressionBase ||
        value.value instanceof Condition
      ) {
        expression(value.value, depth);
        return;
      }
      const text = String(value.value);
      if (/^&[^#]*&$/.test(text) || text === "NULL" || /^[+-]\d+$/.test(text))
        return;
      const reference = text.match(/^#([^#]+)#$/);
      if (reference) {
        column(reference[1]);
        return;
      }
      const unary = text.match(/^-([A-Za-z_][A-Za-z0-9_.]*\*?)$/);
      if (unary) {
        column(unary[1]);
        return;
      }
      if (/["'`() ,#&]/.test(text)) {
        // Mark free-form SQL and still expose explicit column references.
        text.replace(/#([^#]+)#/g, (_, name) => {
          column(name);
          return "";
        });
        visitor.onRaw?.();
      } else column(text);
    }
  };
  const condition = (node: Condition, depth: number): void => {
    if (node instanceof LogicalCondition)
      node.conditions.forEach((c) => condition(c, depth));
    else if (node instanceof NotCondition) condition(node.condition, depth);
    else if (node instanceof BinaryCondition) {
      expression(node.key, depth);
      expression(node.value, depth);
    } else if (node instanceof BetweenCondition) {
      expression(node.key, depth);
      expression(node.from, depth);
      expression(node.to, depth);
    } else if (node instanceof InCondition || node instanceof NotInCondition) {
      expression(node.key, depth);
      if (node.subquery) visit(node.subquery, depth + 1);
      else node.values.forEach((v) => expression(v, depth));
    } else if (
      node instanceof ExistsCondition ||
      node instanceof NotExistsCondition
    ) {
      visit(node.subquery, depth + 1);
    } else if (node instanceof ColumnComparisonCondition) {
      expression(node.leftKey, depth);
      expression(node.rightKey, depth);
    } else if (node instanceof NullCondition || node instanceof LikeCondition)
      expression(node.key, depth);
  };
  const table = (node: Table, depth: number) => {
    if (typeof node.source === "string")
      visitor.onTable?.(node.source, node.alias, depth);
    else visit(node.source, depth + 1);
  };
  const visit = (node: GuardQuery, depth: number): void => {
    if (depth > 0) visitor.onSubquery?.(depth);
    if (node instanceof SelectQuery) {
      node.getFields().forEach((field) => expression(field.name, depth));
      node.tables.forEach((t) => table(t, depth));
      node.getJoins().forEach((join) => {
        table(join.getTable(), depth);
        if (join.getCondition()) condition(join.getCondition()!, depth);
      });
      node.getWhere().forEach((c) => condition(c, depth));
      node.getGroupBy().forEach((e) => expression(e, depth));
      node.getHaving().forEach((c) => condition(c, depth));
      node.getOrderBy().forEach((o) => expression(o.field, depth));
      node.getUnionQueries().forEach((union) => {
        visitor.onUnion?.();
        visit(union.query, depth + 1);
      });
    } else if (
      node instanceof CreateTableAsSelect ||
      node instanceof CreateViewAsSelect
    ) {
      visitor.onTable?.(
        node instanceof CreateTableAsSelect
          ? node.getTableName()
          : node.getViewName(),
        undefined,
        depth
      );
      visit(node.getSelect(), depth + 1);
    } else {
      const kind: MutationKind =
        node instanceof InsertMutation
          ? "insert"
          : node instanceof UpdateMutation
          ? "update"
          : "delete";
      visitor.onMutation?.(kind);
      table(node.getTable(), depth);
      if (node instanceof InsertMutation) {
        node.getValues()?.forEach((row) => Object.keys(row).forEach(column));
        const select = node.getSelectWithColumns();
        if (select) {
          select[1]?.forEach(column);
          visit(select[0], depth + 1);
        }
      } else if (node instanceof UpdateMutation) {
        Object.entries(node.getSetValues()).forEach(([key, value]) => {
          column(key);
          expression(value, depth);
        });
        node.getWhere().forEach((c) => condition(c, depth));
      } else node.getWhere().forEach((c) => condition(c, depth));
    }
  };
  visit(query, 0);
}

/** Stable, deduplicated names in first-visit order. Column table values are AST qualifiers (possibly aliases). */
export function summarize(query: GuardQuery): QuerySummary {
  const summary: QuerySummary = {
    tables: [],
    columns: [],
    functions: [],
    maxDepth: 0,
    hasRaw: false,
    hasUnion: false,
    kind: query.getOperationType(),
  };
  const columns = new Set<string>();
  walk(query, {
    onTable: (name, _alias, depth) => {
      if (!summary.tables.includes(name)) summary.tables.push(name);
      summary.maxDepth = Math.max(summary.maxDepth, depth);
    },
    onColumn: (table, name) => {
      const key = JSON.stringify([table, name]);
      if (!columns.has(key)) {
        columns.add(key);
        summary.columns.push({ table, name });
      }
    },
    onFunction: (name) => {
      if (!summary.functions.includes(name)) summary.functions.push(name);
    },
    onSubquery: (depth) => {
      summary.maxDepth = Math.max(summary.maxDepth, depth);
    },
    onRaw: () => {
      summary.hasRaw = true;
    },
    onUnion: () => {
      summary.hasUnion = true;
    },
  });
  return summary;
}
