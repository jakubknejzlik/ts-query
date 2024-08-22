import { ExpressionBase, FunctionExpression } from "../Expression";
import { MySQLFlavor } from "./mysql";

export class SQLiteFlavor extends MySQLFlavor {
  // protected columnQuotes: string = "'"
  protected stringQuotes: string = "'";
  escapeFunction(fn: FunctionExpression): string {
    const args = fn.value
      .map((arg) => ExpressionBase.deserialize(arg).toSQL(this))
      .join(", ");
    if (fn.name === "MONTH") {
      return `strftime('%m', ${args}, 'localtime')`;
    }
    if (fn.name === "YEAR") {
      return `strftime('%Y', ${args}, 'localtime')`;
    }
    if (fn.name === "IF") {
      return `IIF(${args})`;
    }
    return super.escapeFunction(fn);
  }
  escapeTable(table: string): string {
    return super.escapeTable(table.substring(table.indexOf("@") + 1));
  }
}
