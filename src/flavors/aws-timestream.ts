import { ISequelizableOptions } from "../interfaces";
import dayjs from "dayjs";
import {
  ExpressionBase,
  ExpressionValue,
  FunctionExpression,
} from "../Expression";
import { DefaultFlavor } from "./default";

export class AWSTimestreamFlavor extends DefaultFlavor {
  protected columnQuotes = `"`;
  protected stringQuotes = `'`;
  escapeValue(value: ExpressionValue): string {
    if (value instanceof Date) {
      const formatted = dayjs(value)
        .tz(this.options?.timezone)
        .format("YYYY-MM-DD HH:mm:ss");
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
    if (fn.name === "DATEADD") {
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
