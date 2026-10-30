import { ISequelizableOptions } from "../interfaces";
import {
  ExpressionBase,
  ExpressionValue,
  FunctionExpression,
} from "../Expression";
import { DefaultFlavor } from "./default";

export class AWSTimestreamFlavor extends DefaultFlavor {
  /** @internal Installed on the per-render flavor by the binding renderer. */
  onBindingCast?: (placeholder: string, cast: string) => void;

  escapeBoundValue(placeholder: string, value: unknown): string {
    if (value instanceof Date) {
      // Timestream conversion functions use cast(value AS type).
      // https://docs.aws.amazon.com/timestream/latest/developerguide/conversion-functions.html
      const sql = `CAST(${placeholder} AS TIMESTAMP)`;
      this.onBindingCast?.(placeholder, sql);
      return sql;
    }
    return placeholder;
  }

  protected columnQuotes = `"`;
  protected stringQuotes = `'`;
  escapeValue(value: ExpressionValue): string {
    if (value instanceof Date) {
      const formatted = this.formatDateValue(value);
      return `TIMESTAMP '${formatted}'`;
    }
    return super.escapeValue(value);
  }
  escapeLimitAndOffset(limit?: number, offset?: number): string {
    let str = "";
    if (offset !== undefined) {
      str += ` OFFSET ${offset}`;
    }
    if (limit !== undefined) {
      str += ` LIMIT ${limit}`;
    }
    return str;
  }
  escapeFunction(
    fn: FunctionExpression,
    options?: ISequelizableOptions
  ): string {
    const name = fn.name.toUpperCase();
    if (name === "DATEADD") {
      const args = fn.value.map((arg) =>
        ExpressionBase.deserialize(arg).toSQL(this, options)
      );
      // Only interval operands are literals; the date may be a nested expression.
      const intervalValue = ExpressionBase.deserializeValue(fn.value[1]).value;
      const interval = parseInt(intervalValue.toString(), 10);
      if (isNaN(interval)) {
        throw new Error(`Invalid DATEADD interval: ${intervalValue}`);
      }
      const intervalType = ExpressionBase.deserializeValue(fn.value[2])
        .value.toString()
        .toLowerCase();
      const validIntervalTypes = [
        "year",
        "month",
        "day",
        "hour",
        "minute",
        "second",
        "week",
        "quarter",
      ];
      if (!validIntervalTypes.includes(intervalType)) {
        throw new Error(`Invalid DATEADD interval type: ${intervalType}`);
      }
      if (this.bindValue) {
        return `date_add(${this.bindValue(intervalType)}, ${this.bindValue(
          interval
        )}, ${args[0]})`;
      }
      return `date_add('${intervalType}', ${interval}, ${args[0]})`;
    }
    return super.escapeFunction(fn, options);
  }
}
