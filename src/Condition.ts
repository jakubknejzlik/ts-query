import { Dayjs } from "dayjs";
import { Expression, ExpressionValue, ValueExpression } from "./Expression";
import { ISQLFlavor } from "./Flavor";
import { Q } from "./Query";

export interface Condition {
  toSQL(flavor: ISQLFlavor): string;
  toJSON(): any;
}

export namespace Condition {
  export function fromJSON(json: any): Condition {
    switch (json.type) {
      case "BinaryCondition":
        return BinaryCondition.fromJSON(json);
      case "LogicalCondition":
        return LogicalCondition.fromJSON(json);
      case "BetweenCondition":
        return BetweenCondition.fromJSON(json);
      case "InCondition":
        return InCondition.fromJSON(json);
      case "NotInCondition":
        return NotInCondition.fromJSON(json);
      case "NullCondition":
        return NullCondition.fromJSON(json);
      case "LikeCondition":
        return LikeCondition.fromJSON(json);
      case "ColumnComparisonCondition":
        return ColumnComparisonCondition.fromJSON(json);
      default:
        throw new Error(`Unknown condition type: ${json.type}`);
    }
  }
}

export type ConditionValue = string | number | boolean | null | Dayjs;
type Operator = "=" | "!=" | ">" | "<" | ">=" | "<=";

class BinaryCondition implements Condition {
  key: Expression;
  value: Expression;
  operator: Operator;

  constructor(
    key: ExpressionValue,
    value: ExpressionValue,
    operator: Operator
  ) {
    this.key = Q.expr(key);
    this.value = Q.exprValue(value);
    this.operator = operator;
  }

  toSQL(flavor: ISQLFlavor): string {
    return `${this.key.toSQL(flavor)} ${this.operator} ${this.value.toSQL(
      flavor
    )}`;
  }

  // serialization
  toJSON(): any {
    return {
      type: "BinaryCondition",
      key: this.key.serialize(),
      value: this.value.serialize(),
      operator: this.operator,
    };
  }

  static fromJSON(json: any): BinaryCondition {
    return new BinaryCondition(
      Expression.deserialize(json.key),
      Expression.deserializeValue(json.value),
      json.operator
    );
  }
}

class LogicalCondition implements Condition {
  conditions: Condition[];
  operator: "AND" | "OR";

  constructor(conditions: Condition[], operator: "AND" | "OR") {
    this.conditions = conditions;
    this.operator = operator;
  }

  toSQL(flavor: ISQLFlavor): string {
    return `(${this.conditions
      .map((c) => c.toSQL(flavor))
      .join(` ${this.operator} `)})`;
  }

  // serialization
  toJSON(): any {
    return {
      type: "LogicalCondition",
      conditions: this.conditions.map((condition) => condition.toJSON()),
      operator: this.operator,
    };
  }

  static fromJSON(json: any): LogicalCondition {
    const conditions = json.conditions.map(Condition.fromJSON);
    return new LogicalCondition(conditions, json.operator);
  }
}

class BetweenCondition implements Condition {
  key: Expression;
  from: Expression;
  to: Expression;

  constructor(
    key: ExpressionValue,
    from: ExpressionValue,
    to: ExpressionValue
  ) {
    this.key = Q.expr(key);
    this.from = Q.expr(from);
    this.to = Q.expr(to);
  }

  toSQL(flavor: ISQLFlavor): string {
    return `${this.key.toSQL(flavor)} BETWEEN ${this.from.toSQL(
      flavor
    )} AND ${this.to.toSQL(flavor)}`;
  }

  // serialization
  toJSON(): any {
    return {
      type: "BetweenCondition",
      key: this.key.serialize(),
      from: this.from.serialize(),
      to: this.to.serialize(),
    };
  }

  static fromJSON(json: any): BetweenCondition {
    return new BetweenCondition(
      Expression.deserialize(json.key),
      Expression.deserialize(json.from),
      Expression.deserialize(json.to)
    );
  }
}

class InCondition implements Condition {
  key: Expression;
  values: Expression[];

  constructor(key: ExpressionValue, values: ExpressionValue[]) {
    this.key = Q.expr(key);
    this.values = values.map((v) => Q.exprValue(v));
  }

  toSQL(flavor: ISQLFlavor): string {
    return `${this.key.toSQL(flavor)} IN (${this.values
      .map((v) => v.toSQL(flavor))
      .join(", ")})`;
  }

  // serialization
  toJSON(): any {
    return {
      type: "InCondition",
      key: this.key.serialize(),
      values: this.values.map((v) => v.serialize()),
    };
  }

  static fromJSON(json: any): InCondition {
    return new InCondition(
      Expression.deserialize(json.key),
      json.values.map(Expression.deserializeValue)
    );
  }
}

class NotInCondition implements Condition {
  key: Expression;
  values: Expression[];

  constructor(key: ExpressionValue, values: ExpressionValue[]) {
    this.key = Q.expr(key);
    this.values = values.map((v) => Q.expr(v));
  }

  toSQL(flavor: ISQLFlavor): string {
    return `${this.key.toSQL(flavor)} NOT IN (${this.values
      .map((v) => v.toSQL(flavor))
      .join(", ")})`;
  }

  // serialization
  toJSON(): any {
    return {
      type: "NotInCondition",
      key: this.key.serialize(),
      values: this.values.map((v) => v.serialize()),
    };
  }

  static fromJSON(json: any): NotInCondition {
    return new NotInCondition(
      Expression.deserialize(json.key),
      json.values.map(Expression.deserializeValue)
    );
  }
}

class NullCondition implements Condition {
  key: Expression;
  isNull: boolean;

  constructor(key: ExpressionValue, isNull: boolean) {
    this.key = Q.expr(key);
    this.isNull = isNull;
  }

  toSQL(flavor: ISQLFlavor): string {
    return `${this.key.toSQL(flavor)} IS ${this.isNull ? "" : "NOT "}NULL`;
  }

  // serialization
  toJSON(): any {
    return {
      type: "NullCondition",
      key: this.key.serialize(),
      isNull: this.isNull,
    };
  }

  static fromJSON(json: any): NullCondition {
    return new NullCondition(Expression.deserialize(json.key), json.isNull);
  }
}

class LikeCondition implements Condition {
  key: Expression;
  pattern: string;
  isLike: boolean;

  constructor(key: ExpressionValue, pattern: string, isLike: boolean) {
    this.key = Q.expr(key);
    this.pattern = pattern;
    this.isLike = isLike;
  }

  toSQL(flavor: ISQLFlavor): string {
    return `${this.key.toSQL(flavor)} ${this.isLike ? "" : "NOT "}LIKE \'${
      this.pattern
    }\'`;
  }

  // serialization
  toJSON(): any {
    return {
      type: "LikeCondition",
      key: this.key.serialize(),
      pattern: this.pattern,
      isLike: this.isLike,
    };
  }

  static fromJSON(json: any): LikeCondition {
    return new LikeCondition(
      Expression.deserialize(json.key),
      json.pattern,
      json.isLike
    );
  }
}

class ColumnComparisonCondition implements Condition {
  leftKey: Expression;
  rightKey: Expression;
  operator: Operator;

  constructor(
    leftKey: ExpressionValue,
    rightKey: ExpressionValue,
    operator: Operator
  ) {
    this.leftKey = Q.expr(leftKey);
    this.rightKey = Q.expr(rightKey);
    this.operator = operator;
  }

  toSQL(flavor: ISQLFlavor): string {
    return `${this.leftKey.toSQL(flavor)} ${
      this.operator
    } ${this.rightKey.toSQL(flavor)}`;
  }

  // serialization
  toJSON(): any {
    return {
      type: "ColumnComparisonCondition",
      leftKey: this.leftKey.serialize(),
      rightKey: this.rightKey.serialize(),
      operator: this.operator,
    };
  }

  static fromJSON(json: any): ColumnComparisonCondition {
    return new ColumnComparisonCondition(
      Expression.deserialize(json.leftKey),
      Expression.deserialize(json.rightKey),
      json.operator
    );
  }
}

export const Conditions = {
  fromString: (column: string, value: string | number): Condition => {
    const str = `${value}`;
    if (str.indexOf(">=") === 0) {
      return Conditions.greaterThanOrEqual(column, str.substring(2));
    }
    if (str.indexOf("<=") === 0) {
      return Conditions.lessThanOrEqual(column, str.substring(2));
    }
    if (str.indexOf(">") === 0) {
      return Conditions.greaterThan(column, str.substring(1));
    }
    if (str.indexOf("<") === 0) {
      return Conditions.lessThan(column, str.substring(1));
    }
    if (str.indexOf("~") === 0) {
      return Conditions.or([
        Conditions.like(column, `${str.substring(1)}%`),
        Conditions.like(column, `% ${str.substring(1)}%`),
      ]);
    }
    if (str.indexOf("!~") === 0) {
      return Conditions.and([
        Conditions.notLike(column, `${str.substring(2)}%`),
        Conditions.notLike(column, `% ${str.substring(2)}%`),
      ]);
    }
    if (str.indexOf("!") === 0) {
      return Conditions.notEqual(column, `${str.substring(1)}%`);
    }
    return Conditions.equal(column, str);
  },
  equal: (key: ExpressionValue, value: ExpressionValue) =>
    new BinaryCondition(key, value, "="),
  notEqual: (key: ExpressionValue, value: ExpressionValue) =>
    new BinaryCondition(key, value, "!="),
  greaterThan: (key: ExpressionValue, value: ExpressionValue) =>
    new BinaryCondition(key, value, ">"),
  lessThan: (key: ExpressionValue, value: ExpressionValue) =>
    new BinaryCondition(key, value, "<"),
  greaterThanOrEqual: (key: ExpressionValue, value: ExpressionValue) =>
    new BinaryCondition(key, value, ">="),
  lessThanOrEqual: (key: ExpressionValue, value: ExpressionValue) =>
    new BinaryCondition(key, value, "<="),
  between: (key: ExpressionValue, values: [ExpressionValue, ExpressionValue]) =>
    new BetweenCondition(
      key,
      new ValueExpression(values[0]),
      new ValueExpression(values[1])
    ),
  in: (key: string, values: ExpressionValue[]) => new InCondition(key, values),
  notIn: (key: ExpressionValue, values: ExpressionValue[]) =>
    new NotInCondition(key, values),
  and: (conditions: Condition[]) => new LogicalCondition(conditions, "AND"),
  or: (conditions: Condition[]) => new LogicalCondition(conditions, "OR"),
  null: (key: string) => new NullCondition(key, true),
  notNull: (key: string) => new NullCondition(key, false),
  like: (key: string, pattern: string) => new LikeCondition(key, pattern, true),
  notLike: (key: string, pattern: string) =>
    new LikeCondition(key, pattern, false),
  columnEqual: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, "="),
  columnNotEqual: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, "!="),
  columnGreaterThan: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, ">"),
  columnLessThan: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, "<"),
  columnGreaterThanOrEqual: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, ">="),
  columnLessThanOrEqual: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, "<="),
};
export { Conditions as Cond };
