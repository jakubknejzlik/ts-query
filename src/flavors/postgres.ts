import { ExpressionBase, FunctionExpression } from "../Expression";
import { DefaultFlavor } from "./default";

export class PostgresFlavor extends DefaultFlavor {
  protected columnQuotes = '"';
  protected stringQuotes = "'";

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
      const validIntervalTypes = [
        "year",
        "month",
        "day",
        "hour",
        "minute",
        "second",
        "week",
      ];
      if (!validIntervalTypes.includes(intervalType)) {
        throw new Error(`Invalid DATEADD interval type: ${intervalType}`);
      }
      return `(${args[0]} + INTERVAL '${interval} ${intervalType}')`;
    }

    if (fn.name === "YEAR") {
      return `EXTRACT(YEAR FROM ${args.join(", ")})`;
    }

    if (fn.name === "MONTH") {
      return `EXTRACT(MONTH FROM ${args.join(", ")})`;
    }

    if (fn.name === "IF") {
      const [condition, thenValue, elseValue] = args;
      return `CASE WHEN ${condition} THEN ${thenValue} ELSE ${elseValue} END`;
    }

    if (fn.name === "IFNULL") {
      return `COALESCE(${args.join(",")})`;
    }

    return super.escapeFunction(fn);
  }
}
