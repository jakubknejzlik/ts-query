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
  escapeFunction(fn: FunctionExpression): string {
    const args = fn.value.map((arg) =>
      ExpressionBase.deserialize(arg).toSQL(this)
    );

    if (fn.name === "DATEADD") {
      const argsValues = fn.value.map((x) =>
        ExpressionBase.deserializeValue(x)
      );
      const interval = parseInt(argsValues[1].value.toString(), 10);
      if (isNaN(interval)) {
        throw new Error(`Invalid DATEADD interval: ${argsValues[1].value}`);
      }
      const intervalType = argsValues[2].value.toString().toLowerCase();
      const validIntervalTypes = ['year', 'month', 'day', 'hour', 'minute', 'second', 'week', 'quarter'];
      if (!validIntervalTypes.includes(intervalType)) {
        throw new Error(`Invalid DATEADD interval type: ${intervalType}`);
      }
      return `date_add('${intervalType}', ${interval}, ${args[0]})`;
    }
    return super.escapeFunction(fn);
  }
}
