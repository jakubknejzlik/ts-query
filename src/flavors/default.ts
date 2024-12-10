import dayjs from "dayjs";
import {
  Expression,
  ExpressionRawValue,
  ExpressionValue,
  FunctionExpression,
  OperationExpression,
} from "../Expression";
import { ISQLFlavor } from "../Flavor";
import { UnionType } from "../Query";

import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

type FlavorOptions = {
  timezone?: string;
};

export class DefaultFlavor implements ISQLFlavor {
  protected columnQuotes = "`";
  protected stringQuotes = `"`;

  constructor(public options?: FlavorOptions) {
    this.options = options;
  }

  escapeColumn(name: string, legacyParsing?: boolean): string {
    if (name === "NULL") {
      return name;
    }
    if (legacyParsing) {
      const columnMatch = name.match(/^[\.a-zA-Z0-9_]+$/);
      if (columnMatch) {
        return `${this.columnQuotes}${name
          .replace(
            new RegExp(`/${this.columnQuotes}/`, "g"),
            `${this.columnQuotes}${this.columnQuotes}`
          )
          .split(".")
          .join(`${this.columnQuotes}.${this.columnQuotes}`)}${
          this.columnQuotes
        }`;
      }
      return `${name}`;
    }
    return `${this.columnQuotes}${name
      .split(".")
      .join(`${this.columnQuotes}.${this.columnQuotes}`)}${this.columnQuotes}`;
  }

  escapeTable(table: string): string {
    if (table.indexOf("-") !== -1) {
      return `${this.columnQuotes}${table}${this.columnQuotes}`;
    }
    return this.escapeColumn(table);
  }

  escapeRawValue(value: ExpressionRawValue): string {
    return `${value}`;
  }

  escapeValue(value: ExpressionValue): string {
    if (value === null) {
      return "NULL";
    }
    if (value instanceof Date) {
      return this.escapeValue(
        dayjs(value).tz(this.options?.timezone).format("YYYY-MM-DD HH:mm:ss")
      );
    }
    if (typeof value === "string") {
      return `${this.stringQuotes}${value.replace(
        new RegExp(`${this.stringQuotes}`, "g"),
        `${this.stringQuotes}${this.stringQuotes}`
      )}${this.stringQuotes}`;
    }
    return `${value}`;
  }

  escapeLimitAndOffset(limit?: number, offset?: number): string {
    let str = "";
    if (limit !== undefined) {
      str += ` LIMIT ${limit}`;
    }
    if (offset !== undefined) {
      str += ` OFFSET ${offset}`;
    }
    return str;
  }
  escapeFunction(fn: FunctionExpression): string {
    const args = fn.value
      .map((x) => Expression.deserialize(x).toSQL(this))
      .join(",");
    return `${fn.name}(${args})`;
  }
  escapeOperation(fn: OperationExpression): string {
    return (
      "(" +
      fn.value
        .map((x) => Expression.deserialize(x).toSQL(this))
        .join(` ${fn.operation} `) +
      ")"
    );
  }
  escapeUnion(unionType: UnionType, leftSQL: string, rightSQL: string): string {
    return `(${leftSQL}) ${unionType} (${rightSQL})`;
  }
}
