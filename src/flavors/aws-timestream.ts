import { ExpressionBase, FunctionExpression } from "../Expression";
import { DefaultFlavor } from "./default";

export class AWSTimestreamFlavor extends DefaultFlavor {
  protected columnQuotes = `"`;
  protected stringQuotes = `'`;
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
      const interval = argsValues[1].value.toString();
      const intervalType = argsValues[2].value.toString();
      return `date_add('${intervalType}', ${interval}, ${args[0]})`;
    }
    return super.escapeFunction(fn);
  }
}
