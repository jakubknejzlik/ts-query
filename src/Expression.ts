import { Condition } from "./Condition";
import { ISQLFlavor } from "./Flavor";
import {
  ISequelizable,
  ISequelizableOptions,
  ISerializable,
} from "./interfaces";

export type ExpressionRawValue = string | number | bigint | boolean;
export type ExpressionValue =
  | ExpressionBase
  | ExpressionRawValue
  | FunctionExpression
  | OperationExpression
  | Condition
  | Date;

export class ExpressionBase implements ISerializable, ISequelizable {
  static deserialize(value: ExpressionValue): ExpressionBase {
    if (value instanceof Date) {
      return ValueExpression.deserialize(value);
    }
    const valueIsString = typeof value === "string";
    if (valueIsString && RawExpression.isValueString(value)) {
      return RawExpression.deserialize(value);
    }
    if (valueIsString && ValueExpression.isValueString(value)) {
      return ValueExpression.deserialize(value);
    }
    if (valueIsString && FunctionExpression.isValidString(value)) {
      return FunctionExpression.deserialize(value);
    }
    if (valueIsString && OperationExpression.isValidString(value)) {
      return OperationExpression.deserialize(value);
    }
    if (value instanceof RawExpression) {
      return value;
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
    if (
      valueIsString ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      typeof value === "boolean"
    ) {
      const expr = new Expression(value);
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
    if (value instanceof RawExpression) {
      return value;
    }
    if (typeof value === "string" && RawExpression.isValueString(value)) {
      return RawExpression.deserialize(value);
    }
    return ValueExpression.deserialize(value);
  }
  static deserializeRaw(value: ExpressionRawValue): RawExpression {
    return RawExpression.deserialize(value);
  }
  toSQL(_: ISQLFlavor, __?: ISequelizableOptions): string {
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

  toSQL(flavor: ISQLFlavor, options?: ISequelizableOptions): string {
    if (this.value instanceof Expression) {
      return this.value.toSQL(flavor, options);
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

export class ValueExpression extends Expression<ExpressionValue> {
  static isValueString(str: string): boolean {
    return str.startsWith("!!!") || this.isValueDateString(str);
  }
  static isValueDateString(str: string): boolean {
    return str.startsWith("!D!");
  }
  toSQL(flavor: ISQLFlavor, options?: ISequelizableOptions): string {
    if (
      typeof this.value === "number" ||
      typeof this.value === "string" ||
      typeof this.value === "bigint" ||
      typeof this.value === "boolean" ||
      this.value instanceof Date
    ) {
      return flavor.escapeValue(this.value);
    }
    return this.value.toSQL(flavor, options);
  }
  serialize(): string {
    if (this.value instanceof Date) {
      return `!D!` + this.value.valueOf() + "!!";
    }
    return `!!!` + JSON.stringify(this.value);
  }
  static deserialize(value: ExpressionValue): ValueExpression {
    const isStringValue = typeof value === "string";
    if (isStringValue && ValueExpression.isValueString(value)) {
      if (ValueExpression.isValueDateString(value)) {
        return new ValueExpression(
          new Date(parseInt(value.substring(3, value.length - 2), 10))
        );
      }
      const res = new ValueExpression(JSON.parse(value.substring(3)));
      return res;
    }

    return new ValueExpression(value);
  }
}

export class RawExpression extends Expression<ExpressionRawValue> {
  static isValueString(str: string): boolean {
    return str.startsWith("!!") && str.endsWith("!!");
  }
  toSQL(flavor: ISQLFlavor, _?: ISequelizableOptions): string {
    return flavor.escapeRawValue(this.value);
  }
  serialize(): string {
    return `!!` + JSON.stringify(this.value) + "!!";
  }
  static deserialize(value: ExpressionRawValue): RawExpression {
    if (
      typeof value === "string" &&
      value.startsWith("!!") &&
      value.endsWith("!!")
    ) {
      const res = new RawExpression(
        JSON.parse(value.substring(2, value.length - 2))
      );
      return res;
    }
    throw new Error(`Invalid raw expression: '${value}'`);
  }
}

export class FunctionExpression extends Expression<ExpressionValue[]> {
  constructor(public name: string, ...args: ExpressionValue[]) {
    super(args);
  }
  toSQL(flavor: ISQLFlavor, _?: ISequelizableOptions): string {
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
  toSQL(flavor: ISQLFlavor, _?: ISequelizableOptions): string {
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
