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
      return `DateTime(${args[0]}, '${
        parseInt(fn.value[1].toString(), 10) >= 0
          ? "+" + fn.value[1].toString()
          : fn.value[1].toString()
      } ${fn.value[2].toString()}')`;
    }
    return super.escapeFunction(fn);
  }
  escapeTable(table: string): string {
    return super.escapeTable(table.substring(table.indexOf("@") + 1));
  }
}
