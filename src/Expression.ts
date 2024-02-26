import { Condition, ConditionValue } from "./Condition";
import { ISQLFlavor } from "./Flavor";
import { ISequelizable, ISerializable } from "./interfaces";

export type ExpressionRawValue = string | number;
export type ExpressionValue =
  | ExpressionBase
  | ExpressionRawValue
  | FunctionExpression
  | OperationExpression
  | Condition;

export class ExpressionBase implements ISerializable, ISequelizable {
  static deserialize(value: ExpressionValue, exact = false): ExpressionBase {
    const valueIsString = typeof value === "string";
    if (valueIsString && ValueExpression.isValueString(value)) {
      return ValueExpression.deserialize(value);
    }
    if (valueIsString && FunctionExpression.isValidString(value)) {
      return FunctionExpression.deserialize(value);
    }
    if (valueIsString && OperationExpression.isValidString(value)) {
      return OperationExpression.deserialize(value);
    }
    if (
      valueIsString ||
      (value instanceof Expression && typeof value.value === "string")
    ) {
      const condition = Condition.deserialize(
        value instanceof Expression ? value.value : value
      );
      if (condition !== null) {
        return condition;
      }
    }
    if (valueIsString || typeof value === "number") {
      const expr = new Expression(value);
      expr.setExact(exact);
      return expr;
    }
    if (value instanceof Condition) {
      return Condition.deserialize(value);
    }
    return value;
  }
  static deserializeValue(value: ExpressionValue): ValueExpression {
    if (value instanceof FunctionExpression) {
      throw new Error("FunctionExpression cannot be used as a value");
    }
    if (value instanceof ValueExpression) {
      return value;
    }
    return ValueExpression.deserialize(value);
  }
  toSQL(flavor: ISQLFlavor): string {
    throw new Error("Method not implemented.");
  }
  serialize(): string {
    throw new Error("Method not implemented.");
  }
}
export class Expression<T = ExpressionValue> extends ExpressionBase {
  constructor(public value: T) {
    super();
  }

  setExact(exact: boolean): this {
    return this;
  }

  toSQL(flavor: ISQLFlavor): string {
    if (this.value instanceof Expression) {
      return this.value.toSQL(flavor);
    }
    let value = `${this.value}`;
    const stringMatches = value.match(/&([^#]+)&/g);
    if (stringMatches) {
      for (const match of stringMatches) {
        value = value.replace(
          match,
          flavor.escapeValue(match.substring(1, match.length - 1))
        );
      }
    }

    const matches = value.match(/#([^#]+)#/g);
    if (matches) {
      for (const match of matches) {
        value = value.replace(
          match,
          flavor.escapeColumn(match.substring(1, match.length - 1))
        );
      }
    }

    return flavor.escapeColumn(value, true);
  }
  serialize(): string {
    return `${this.value}`;
  }

  static escapeColumn(column: ExpressionRawValue): string {
    return `#${column}#`;
  }
  static escapeString(column: ExpressionRawValue): string {
    return `&${column}&`;
  }
  static escapeExpressionValue(column: ExpressionValue): string {
    if (typeof column === "string" || typeof column === "number") {
      return this.escapeColumn(column);
    }
    if (column instanceof FunctionExpression) {
      throw new Error("FunctionExpression cannot be used as a value");
    }
    if (column instanceof Expression) {
      return `${column.value}`;
    }
    throw new Error(`Invalid expression value: ${column}`);
  }
}

export class ValueExpression extends Expression {
  static isValueString(str: string): boolean {
    return str.startsWith("!!!");
  }
  toSQL(flavor: ISQLFlavor): string {
    if (typeof this.value === "number" || typeof this.value === "string") {
      return flavor.escapeValue(this.value);
    }
    return this.value.toSQL(flavor);
  }
  serialize(): string {
    return `!!!` + JSON.stringify(this.value);
  }
  static deserialize(value: ExpressionValue): ValueExpression {
    if (typeof value === "string" && value.startsWith("!!!")) {
      const res = new ValueExpression(JSON.parse(value.substring(3)));
      return res;
    }
    if (value instanceof Expression) {
      return new ValueExpression(value.value);
    }
    return new ValueExpression(value);
  }
}

export class FunctionExpression extends Expression<ExpressionValue[]> {
  constructor(public name: string, ...args: ExpressionValue[]) {
    super(args);
  }
  toSQL(flavor: ISQLFlavor): string {
    return flavor.escapeFunction(this);
  }
  static isValidString(str: string): boolean {
    return str.startsWith("FN(") && str.endsWith(")");
  }
  static deserialize(value: ExpressionValue): FunctionExpression {
    if (typeof value === "string") {
      const content = value.substring(3, value.length - 1);
      const [name, ...args] = JSON.parse(content);
      return new FunctionExpression(name, ...args.map(Expression.deserialize));
    }
    throw new Error(`Invalid function expression: '${value}'`);
  }
  serialize(): string {
    return (
      `FN(` +
      JSON.stringify([
        this.name,
        ...this.value.map((v) => Expression.deserialize(v).serialize()),
      ]) +
      `)`
    );
  }
}

export class OperationExpression extends Expression<ExpressionValue[]> {
  constructor(public operation, ...args: ExpressionValue[]) {
    super(args);
  }
  toSQL(flavor: ISQLFlavor): string {
    return flavor.escapeOperation(this);
  }
  static isValidString(str: string): boolean {
    return str.startsWith("OP(") && str.endsWith(")");
  }
  static deserialize(value: ExpressionValue): OperationExpression {
    if (typeof value === "string") {
      const content = value.substring(3, value.length - 1);
      const [operation, ...args] = JSON.parse(content);
      return new OperationExpression(
        operation,
        ...args.map(Expression.deserialize)
      );
    }
    throw new Error(`Invalid function expression: '${value}'`);
  }
  serialize(): string {
    return (
      `OP(` +
      JSON.stringify([
        this.operation,
        ...this.value.map((v) => Expression.deserialize(v).serialize()),
      ]) +
      `)`
    );
  }
}
