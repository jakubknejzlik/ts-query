import { Dayjs } from "dayjs";
import { Expression, ExpressionBase, ExpressionValue } from "./Expression";
import { ISQLFlavor } from "./Flavor";
import { Q } from "./Query";
import { ISequelizable, ISerializable } from "./interfaces";

type ConditionValue = ExpressionValue | Dayjs;

export class Condition implements ISequelizable, ISerializable {
  toSQL(flavor: ISQLFlavor): string {
    throw new Error("Method not implemented.");
  }
  toJSON(): any {
    throw new Error("Method not implemented.");
  }
  serialize(): string {
    return JSON.stringify(this.toJSON());
  }
  static fromJSON(json: any): Condition {
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
        throw new Error(
          `Unknown condition type: ${json.type} (${JSON.stringify(json)})`
        );
    }
  }
  static deserialize(value: Condition | string): Condition | null {
    if (typeof value === "string") {
      try {
        return Condition.fromJSON(JSON.parse(value));
      } catch {
        return null;
      }
    }
    return value;
  }
}

type Operator = "=" | "!=" | ">" | "<" | ">=" | "<=";

class BinaryCondition extends Condition {
  key: ExpressionBase;
  value: ExpressionBase;
  operator: Operator;

  constructor(key: ConditionValue, value: ConditionValue, operator: Operator) {
    super();
    this.key = Q.expr(key);
    this.value = Q.value(value);
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
      ExpressionBase.deserialize(json.key),
      ExpressionBase.deserializeValue(json.value),
      json.operator
    );
  }
}

class LogicalCondition extends Condition {
  conditions: Condition[];
  operator: "AND" | "OR";

  constructor(conditions: Condition[], operator: "AND" | "OR") {
    super();
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

class BetweenCondition extends Condition {
  key: ExpressionBase;
  from: ExpressionBase;
  to: ExpressionBase;

  constructor(key: ConditionValue, from: ConditionValue, to: ConditionValue) {
    super();
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
      ExpressionBase.deserialize(json.key),
      ExpressionBase.deserializeValue(json.from),
      ExpressionBase.deserializeValue(json.to)
    );
  }
}

class InCondition extends Condition {
  key: ExpressionBase;
  values: ExpressionBase[];

  constructor(key: ConditionValue, values: ConditionValue[]) {
    super();
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
      ExpressionBase.deserialize(json.key),
      json.values.map(ExpressionBase.deserializeValue)
    );
  }
}

class NotInCondition extends Condition {
  key: ExpressionBase;
  values: ExpressionBase[];

  constructor(key: ConditionValue, values: ConditionValue[]) {
    super();
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
      ExpressionBase.deserialize(json.key),
      json.values.map(ExpressionBase.deserializeValue)
    );
  }
}

class NullCondition extends Condition {
  key: ExpressionBase;
  isNull: boolean;

  constructor(key: ConditionValue, isNull: boolean) {
    super();
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
    return new NullCondition(ExpressionBase.deserialize(json.key), json.isNull);
  }
}

class LikeCondition extends Condition {
  key: ExpressionBase;
  pattern: string;
  isLike: boolean;

  constructor(key: ConditionValue, pattern: string, isLike: boolean) {
    super();
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
      ExpressionBase.deserialize(json.key),
      json.pattern,
      json.isLike
    );
  }
}

class ColumnComparisonCondition extends Condition {
  leftKey: ExpressionBase;
  rightKey: ExpressionBase;
  operator: Operator;

  constructor(
    leftKey: ConditionValue,
    rightKey: ConditionValue,
    operator: Operator
  ) {
    super();
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
      ExpressionBase.deserialize(json.leftKey),
      ExpressionBase.deserialize(json.rightKey),
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
  equal: (key: ConditionValue, value: ConditionValue) =>
    new BinaryCondition(key, value, "="),
  notEqual: (key: ConditionValue, value: ConditionValue) =>
    new BinaryCondition(key, value, "!="),
  greaterThan: (key: ConditionValue, value: ConditionValue) =>
    new BinaryCondition(key, value, ">"),
  lessThan: (key: ConditionValue, value: ConditionValue) =>
    new BinaryCondition(key, value, "<"),
  greaterThanOrEqual: (key: ConditionValue, value: ConditionValue) =>
    new BinaryCondition(key, value, ">="),
  lessThanOrEqual: (key: ConditionValue, value: ConditionValue) =>
    new BinaryCondition(key, value, "<="),
  between: (key: ConditionValue, values: [ConditionValue, ConditionValue]) =>
    new BetweenCondition(key, Q.exprValue(values[0]), Q.exprValue(values[1])),
  in: (key: string, values: ConditionValue[]) =>
    values.length > 0 ? new InCondition(key, values) : null,
  notIn: (key: ConditionValue, values: ConditionValue[]) =>
    new NotInCondition(key, values),
  and: (conditions: (Condition | null)[]) => {
    const _c = conditions.filter((c) => c !== null);
    return _c.length > 0 ? new LogicalCondition(_c, "AND") : null;
  },
  or: (conditions: (Condition | null)[]) => {
    const _c = conditions.filter((c) => c !== null);
    return _c.length > 0 ? new LogicalCondition(_c, "OR") : null;
  },
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
