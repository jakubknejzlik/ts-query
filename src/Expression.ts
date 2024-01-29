import { ISQLFlavor } from "./Flavor";
import { ISequelizable, ISerializable } from "./Query";

export type ExpressionOrString = Expression | string;

export class Expression implements ISerializable, ISequelizable {
  constructor(private value: string) {}

  toSQL(flavor: ISQLFlavor): string {
    let value = this.value;
    const stringMatches = this.value.match(/&([^#]+)&/g);
    if (stringMatches) {
      for (const match of stringMatches) {
        const column = match.replace(/&/g, "");
        value = value.replace(
          match,
          flavor.escapeValue(match.substring(1, match.length - 1))
        );
      }
    }

    const matches = this.value.match(/#([^#]+)#/g);
    if (matches) {
      for (const match of matches) {
        const column = match.replace(/#/g, "");
        value = value.replace(
          match,
          flavor.escapeColumn(match.substring(1, match.length - 1))
        );
      }
    }

    return flavor.escapeColumn(value, true);
  }
  serialize(): string {
    return this.value;
  }
  static deserialize(value: ExpressionOrString): Expression {
    if (typeof value === "string") {
      return new Expression(value);
    }
    return value;
  }
  static escapeColumn(column: string): string {
    return `#${column}#`;
  }
  static escapeString(column: string): string {
    return `&${column}&`;
  }
  static fromColumnOrExpression(column: ExpressionOrString): string {
    if (typeof column === "string") {
      return this.escapeColumn(column);
    }
    return column.value;
  }
}
