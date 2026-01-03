import { ExpressionBase, FunctionExpression } from "../Expression";
import { MySQLFlavor } from "./mysql";

export class SQLiteFlavor extends MySQLFlavor {
  // protected columnQuotes: string = "'"
  protected stringQuotes: string = "'";
  escapeFunction(fn: FunctionExpression): string {
    const args = fn.value.map((arg) =>
      ExpressionBase.deserialize(arg).toSQL(this)
    );
    if (fn.name === "MONTH") {
      return `strftime('%m', ${args.join(", ")}, 'localtime')`;
    }
    if (fn.name === "YEAR") {
      return `strftime('%Y', ${args.join(", ")}, 'localtime')`;
    }
    if (fn.name === "IF") {
      return `IIF(${args.join(", ")})`;
    }
    if (fn.name === "DATEADD") {
      const argsValues = fn.value.map((x) =>
        ExpressionBase.deserializeValue(x)
      );
      const interval = parseInt(argsValues[1].value.toString(), 10);
      if (isNaN(interval)) {
        throw new Error(`Invalid DATEADD interval: ${argsValues[1].value}`);
      }
      const intervalType = argsValues[2].value.toString().toLowerCase();
      // SQLite supports: years, months, days, hours, minutes, seconds
      const validIntervalTypes = ['year', 'month', 'day', 'hour', 'minute', 'second', 'years', 'months', 'days', 'hours', 'minutes', 'seconds'];
      if (!validIntervalTypes.includes(intervalType)) {
        throw new Error(`Invalid DATEADD interval type: ${intervalType}`);
      }
      return `DateTime(${args[0]}, '${interval >= 0 ? "+" + interval : interval} ${intervalType}')`;
    }
    return super.escapeFunction(fn);
  }
  escapeTable(table: string): string {
    return super.escapeTable(table.substring(table.indexOf("@") + 1));
  }
}
