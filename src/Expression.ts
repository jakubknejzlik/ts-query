import { ISQLFlavor } from "./Flavor";
import { ISequelizable, ISerializable } from "./interfaces";

export type ExpressionRawValue = string | number;
export type ExpressionValue = Expression | ExpressionRawValue;

export class Expression implements ISerializable, ISequelizable {
  constructor(protected value: ExpressionValue) {}

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
  static deserialize(value: ExpressionValue): Expression {
    if (typeof value === "string" && value.startsWith("!!!")) {
      return ValueExpression.deserialize(value);
    }
    if (typeof value === "string" || typeof value === "number") {
      return new Expression(value);
    }
    return value;
  }
  static deserializeValue(value: ExpressionValue): ValueExpression {
    if (value instanceof ValueExpression) {
      return value;
    }
    return ValueExpression.deserialize(value);
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
    return `${column.value}`;
  }
}

export class ValueExpression extends Expression {
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
    return new ValueExpression(value);
  }
}
