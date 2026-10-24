export type DeserializeErrorCode =
  | "raw_not_allowed"
  | "function_not_allowed"
  | "max_depth_exceeded"
  | "invalid_node"
  | "unsupported_version";

export class DeserializeError extends Error {
  constructor(
    public readonly code: DeserializeErrorCode,
    message: string = code
  ) {
    super(message);
    this.name = "DeserializeError";
  }
}

export interface DeserializeOptions {
  allowRaw?: boolean;
  /** Case-insensitive function names. Omitted means unrestricted; [] denies all. */
  functions?: string[];
  /** Root depth is zero. Each nested SELECT, including a union operand, adds one. */
  maxDepth?: number;
}

export function assertSerializationVersion(node: any): void {
  if (node && Object.prototype.hasOwnProperty.call(node, "v") && node.v !== 1) {
    throw new DeserializeError(
      "unsupported_version",
      `Unsupported serialization version: ${JSON.stringify(node.v)}`
    );
  }
}

export const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(?:[A-Za-z_][A-Za-z0-9_$@-]*|\*)(?:\.(?:[A-Za-z_][A-Za-z0-9_$@-]*|\*))*$/.test(
    value
  );

/** Validate the wire format before invoking any of the legacy AST constructors. */
export function validateSerializedQuery(
  root: unknown,
  options: DeserializeOptions
): void {
  const invalid = (message: string): never => {
    throw new DeserializeError("invalid_node", message);
  };
  const raw = (): void => {
    if (options.allowRaw === false)
      throw new DeserializeError("raw_not_allowed");
  };
  if (options.allowRaw !== undefined && typeof options.allowRaw !== "boolean") {
    invalid("allowRaw must be a boolean");
  }
  if (
    options.maxDepth !== undefined &&
    (!Number.isInteger(options.maxDepth) || options.maxDepth < 0)
  ) {
    invalid("maxDepth must be a non-negative integer");
  }
  if (
    options.functions !== undefined &&
    (!Array.isArray(options.functions) ||
      options.functions.some((x) => typeof x !== "string"))
  ) {
    invalid("functions must be an array of names");
  }
  const functions =
    options.functions && new Set(options.functions.map((x) => x.toUpperCase()));
  type Task = {
    value: any;
    kind: "query" | "select" | "table" | "condition" | "expression" | "value";
    depth: number;
  };
  const tasks: Task[] = [{ value: root, kind: "query", depth: 0 }];
  const object = (value: any) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      invalid("Expected a node object");
  };
  const scalar = (value: any) =>
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
  const text = (value: any) => {
    if (typeof value !== "string") invalid("Expected a string");
  };
  const identifier = (value: any) => {
    text(value);
    if (options.allowRaw === false && !isIdentifier(value))
      invalid("Invalid identifier");
  };
  const alias = (value: any) => {
    if (value !== undefined) identifier(value);
  };
  const enumValue = (value: any, choices: any[]) => {
    if (!choices.includes(value)) invalid("Invalid operator or modifier");
  };
  while (tasks.length) {
    const { value: node, kind, depth } = tasks.pop()!;
    const push = (value: any, nextKind: Task["kind"], nextDepth = depth) =>
      tasks.push({ value, kind: nextKind, depth: nextDepth });
    const list = (value: any, nextKind: Task["kind"], optional = true) => {
      if (value === undefined && optional) return;
      if (!Array.isArray(value)) invalid("Expected an array");
      value.forEach((x) => push(x, nextKind));
    };
    if (kind === "expression" || kind === "value") {
      if (!scalar(node) || (kind === "expression" && node === null))
        invalid("Invalid expression");
      if (typeof node !== "string") continue;
      if (node.startsWith("!!") && node.endsWith("!!")) {
        raw();
        if (!scalar(JSON.parse(node.slice(2, -2))))
          invalid("Invalid raw value");
      } else if (node.startsWith("!!!")) {
        if (!scalar(JSON.parse(node.slice(3)))) invalid("Invalid literal");
      } else if (node.startsWith("!D!")) {
        if (
          !/^!D!-?\d+!!$/.test(node) ||
          !Number.isFinite(new Date(Number(node.slice(3, -2))).valueOf())
        )
          invalid("Invalid date literal");
      } else if (kind === "value") {
        // Plain strings in a value slot are data, even if they resemble encodings.
        continue;
      } else if (
        (node.startsWith("FN(") || node.startsWith("OP(")) &&
        node.endsWith(")")
      ) {
        const parts = JSON.parse(node.slice(3, -1));
        if (!Array.isArray(parts) || typeof parts[0] !== "string")
          invalid("Invalid function or operation");
        const [name, ...args] = parts;
        if (node.startsWith("FN(")) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
            invalid("Invalid function name");
          if (functions && !functions.has(name.toUpperCase()))
            throw new DeserializeError(
              "function_not_allowed",
              `Function not allowed: ${name}`
            );
        } else {
          enumValue(name, ["+", "-", "*", "/"]);
        }
        args.forEach((x) => push(x, "expression"));
      } else if (node.startsWith("{")) {
        const parsed = JSON.parse(node);
        push(parsed, "condition");
      } else if (options.allowRaw === false) {
        // Accept complete tokens only. Removing safe fragments first would
        // admit SQL suffixes such as `#id#a--` outside the quoted column.
        const column = node.match(/^#([^#]+)#$/);
        if (column) {
          if (!isIdentifier(column[1])) invalid("Invalid column reference");
        } else if (
          !isIdentifier(node) &&
          !/^[+-]?\d+(?:\.\d+)?$/.test(node) &&
          !/^-([A-Za-z_][A-Za-z0-9_.]*\*?)$/.test(node) &&
          !/^&[^#]*&$/.test(node)
        ) {
          raw();
        }
      }
      continue;
    }
    object(node);
    assertSerializationVersion(node);
    if (kind === "table") {
      enumValue(node.type, ["Table"]);
      alias(node.alias);
      if (typeof node.source === "string") identifier(node.source);
      else push(node.source, "select", depth + 1);
      continue;
    }
    if (kind === "condition") {
      switch (node.type) {
        case "BinaryCondition":
          enumValue(node.operator, ["=", "!=", ">", "<", ">=", "<="]);
          push(node.key, "expression");
          push(node.value, "value");
          break;
        case "ColumnComparisonCondition":
          enumValue(node.operator, ["=", "!=", ">", "<", ">=", "<="]);
          push(node.leftKey, "expression");
          push(node.rightKey, "expression");
          break;
        case "LogicalCondition":
          enumValue(node.operator, ["AND", "OR"]);
          list(node.conditions, "condition", false);
          break;
        case "NotCondition":
          push(node.condition, "condition");
          break;
        case "BetweenCondition":
          push(node.key, "expression");
          push(node.from, "value");
          push(node.to, "value");
          break;
        case "InCondition":
        case "NotInCondition":
          push(node.key, "expression");
          if (node.subquery !== undefined)
            push(node.subquery, "select", depth + 1);
          else list(node.values, "value", false);
          break;
        case "ExistsCondition":
        case "NotExistsCondition":
          push(node.subquery, "select", depth + 1);
          break;
        case "NullCondition":
          push(node.key, "expression");
          enumValue(node.isNull, [true, false]);
          break;
        case "LikeCondition":
          push(node.key, "expression");
          text(node.pattern);
          enumValue(node.isLike, [true, false]);
          if (node.caseInsensitive !== undefined)
            enumValue(node.caseInsensitive, [true, false]);
          break;
        default:
          invalid("Unknown condition node");
      }
      continue;
    }
    if (kind === "select" && node.type !== "SelectQuery")
      invalid("Expected a SELECT subquery");
    if (options.maxDepth !== undefined && depth > options.maxDepth)
      throw new DeserializeError("max_depth_exceeded");
    if (
      ["InsertMutation", "UpdateMutation", "DeleteMutation"].includes(
        node.type
      ) &&
      typeof node.table?.source !== "string"
    ) {
      invalid("Mutation target must be a table name");
    }
    switch (node.type) {
      case "SelectQuery":
        list(node.tables, "table", false);
        for (const field of node.fields ?? []) {
          object(field);
          alias(field.alias);
          push(field.name, "expression");
        }
        for (const order of node.orderBy ?? []) {
          object(order);
          enumValue(order.direction, ["ASC", "DESC"]);
          push(order.field, "expression");
        }
        list(node.groupBy, "expression");
        list(node.where, "condition");
        list(node.having, "condition");
        for (const join of node.joins ?? []) {
          object(join);
          enumValue(join.type, ["Join"]);
          enumValue(join.joinType, ["INNER", "LEFT", "RIGHT", "FULL", "CROSS"]);
          push(join.table, "table");
          if (join.condition !== undefined) push(join.condition, "condition");
        }
        for (const union of node.unionQueries ?? []) {
          object(union);
          enumValue(union.type, ["UNION", "UNION ALL"]);
          push(union.query, "select", depth + 1);
        }
        for (const value of [node.limit, node.offset])
          if (value !== undefined && (!Number.isInteger(value) || value < 0))
            invalid("Invalid limit or offset");
        break;
      case "InsertMutation":
        push(node.table, "table");
        if (node.values !== undefined) {
          if (!Array.isArray(node.values) || !node.values.length)
            invalid("Expected insert rows");
          for (const row of node.values) {
            object(row);
            for (const [key, value] of Object.entries(row)) {
              identifier(key);
              if (!scalar(value)) invalid("Invalid insert value");
            }
          }
        }
        if (node.select !== undefined) {
          if (!Array.isArray(node.select) || node.select.length !== 2)
            invalid("Invalid insert select");
          push(node.select[0], "select", depth + 1);
          if (node.select[1] != null) {
            if (!Array.isArray(node.select[1]))
              invalid("Invalid insert columns");
            node.select[1].forEach(identifier);
          }
        }
        if ((node.values === undefined) === (node.select === undefined))
          invalid("Insert requires values or select");
        break;
      case "UpdateMutation":
        push(node.table, "table");
        object(node.values);
        for (const [key, value] of Object.entries(node.values)) {
          identifier(key);
          if (key === "__proto__") invalid("Invalid update key");
          if (typeof value !== "string") invalid("Invalid update expression");
          if (
            (value as string).startsWith("{") &&
            JSON.parse(value as string).type === "SelectQuery"
          )
            push(JSON.parse(value as string), "select", depth + 1);
          else push(value, "expression");
        }
        list(node.where, "condition", false);
        break;
      case "DeleteMutation":
        push(node.table, "table");
        list(node.where, "condition", false);
        break;
      case "ctas":
      case "cvas":
        identifier(node.type === "ctas" ? node.tableName : node.viewName);
        if (node.orReplace !== undefined)
          enumValue(node.orReplace, [true, false]);
        if (node.ifNotExists !== undefined)
          enumValue(node.ifNotExists, [true, false]);
        push(node.select, "select", depth + 1);
        break;
      default:
        invalid("Unknown query node");
    }
  }
}
