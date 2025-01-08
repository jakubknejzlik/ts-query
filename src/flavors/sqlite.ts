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
      return `DateTime(${args[0]}, '${
        parseInt(argsValues[1].value.toString(), 10) >= 0
          ? "+" + argsValues[1].value.toString()
          : argsValues[1].value.toString()
      } ${argsValues[2].value.toString()}')`;
    }
    return super.escapeFunction(fn);
  }
  escapeTable(table: string): string {
    return super.escapeTable(table.substring(table.indexOf("@") + 1));
  }
}
