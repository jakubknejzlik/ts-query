import dayjs from "dayjs";
import {
  Expression,
  ExpressionBase,
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
      // In legacy mode, allow through values that appear to be:
      // - Already escaped (contains column quotes)
      // - Complex expressions (parentheses, operators, spaces)
      // - String literals (already quoted with string quotes)
      // - Special values like *, +0, -1, TRUE, FALSE
      if (
        name.includes(this.columnQuotes) ||
        name.includes(this.stringQuotes) ||
        name.includes('(') ||
        name.includes(')') ||
        name.includes(' ') ||
        name.includes(',') ||
        /^[+\-]?\d+$/.test(name) ||
        /^[*]$/.test(name) ||
        name === 'TRUE' ||
        name === 'FALSE'
      ) {
        return `${name}`;
      }
      // Escape the column name to prevent SQL injection
      return `${this.columnQuotes}${name
        .replace(
          new RegExp(this.columnQuotes, "g"),
          `${this.columnQuotes}${this.columnQuotes}`
        )
        .split(".")
        .join(`${this.columnQuotes}.${this.columnQuotes}`)}${this.columnQuotes}`;
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
      .map((x) => Expression.deserialize(x))
      .map((x) => x.toSQL(this));
    if (fn.name === "DATEADD") {
      const argsValues = fn.value.map((x) =>
        ExpressionBase.deserializeValue(x)
      );
      const interval = parseInt(argsValues[1].value.toString(), 10);
      if (isNaN(interval)) {
        throw new Error(`Invalid DATEADD interval: ${argsValues[1].value}`);
      }
      const intervalType = argsValues[2].value.toString().toLowerCase();
      // MySQL supports: YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, WEEK, QUARTER
      const validIntervalTypes = ['year', 'month', 'day', 'hour', 'minute', 'second', 'week', 'quarter'];
      if (!validIntervalTypes.includes(intervalType)) {
        throw new Error(`Invalid DATEADD interval type: ${intervalType}`);
      }
      return `DATE_ADD(${args[0]}, INTERVAL ${interval} ${intervalType.toUpperCase()})`;
    }
    return `${fn.name}(${args.join(",")})`;
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
