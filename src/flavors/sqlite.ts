import { ISequelizableOptions } from "../interfaces";
import { ExpressionBase, FunctionExpression } from "../Expression";
import { MySQLFlavor } from "./mysql";

export class SQLiteFlavor extends MySQLFlavor {
  // protected columnQuotes: string = "'"
  protected stringQuotes: string = "'";
  escapeFunction(
    fn: FunctionExpression,
    options?: ISequelizableOptions
  ): string {
    const name = fn.name.toUpperCase();
    const renderArgs = () =>
      fn.value.map((arg) =>
        ExpressionBase.deserialize(arg).toSQL(this, options)
      );
    if (name === "MONTH") {
      return `strftime('%m', ${renderArgs().join(", ")}, 'localtime')`;
    }
    if (name === "YEAR") {
      return `strftime('%Y', ${renderArgs().join(", ")}, 'localtime')`;
    }
    if (name === "IF") {
      return `IIF(${renderArgs().join(", ")})`;
    }
    if (name === "DATEADD") {
      // Only interval operands are literals; the date may be a nested expression.
      const intervalValue = ExpressionBase.deserializeValue(fn.value[1]).value;
      const interval = parseInt(intervalValue.toString(), 10);
      if (isNaN(interval)) {
        throw new Error(`Invalid DATEADD interval: ${intervalValue}`);
      }
      const intervalType = ExpressionBase.deserializeValue(fn.value[2])
        .value.toString()
        .toLowerCase();
      // SQLite supports: years, months, days, hours, minutes, seconds
      const validIntervalTypes = [
        "year",
        "month",
        "day",
        "hour",
        "minute",
        "second",
        "years",
        "months",
        "days",
        "hours",
        "minutes",
        "seconds",
      ];
      if (!validIntervalTypes.includes(intervalType)) {
        throw new Error(`Invalid DATEADD interval type: ${intervalType}`);
      }
      if (this.bindValue) {
        return `DateTime(${renderArgs()[0]}, ${this.bindValue(
          `${interval >= 0 ? "+" + interval : interval} ${intervalType}`
        )})`;
      }
      return `DateTime(${renderArgs()[0]}, '${
        interval >= 0 ? "+" + interval : interval
      } ${intervalType}')`;
    }
    return super.escapeFunction(fn, options);
  }
  escapeTable(table: string): string {
    return super.escapeTable(table.substring(table.indexOf("@") + 1));
  }
}
