import { ISequelizableOptions } from "../interfaces";
import { ExpressionBase, FunctionExpression } from "../Expression";
import { DefaultFlavor } from "./default";

export class PostgresFlavor extends DefaultFlavor {
  parameterPlaceholder(index: number): string {
    return `$${index}`;
  }

  protected columnQuotes = '"';
  protected stringQuotes = "'";

  escapeFunction(
    fn: FunctionExpression,
    options?: ISequelizableOptions
  ): string {
    const renderArgs = () =>
      fn.value.map((arg) =>
        ExpressionBase.deserialize(arg).toSQL(this, options)
      );

    if (fn.name === "DATEADD") {
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
      ];
      if (!validIntervalTypes.includes(intervalType)) {
        throw new Error(`Invalid DATEADD interval type: ${intervalType}`);
      }
      if (this.bindValue) {
        return `(${renderArgs()[0]} + CAST(${this.bindValue(
          `${interval} ${intervalType}`
        )} AS INTERVAL))`;
      }
      return `(${renderArgs()[0]} + INTERVAL '${interval} ${intervalType}')`;
    }

    if (fn.name === "YEAR") {
      return `EXTRACT(YEAR FROM ${renderArgs().join(", ")})`;
    }

    if (fn.name === "MONTH") {
      return `EXTRACT(MONTH FROM ${renderArgs().join(", ")})`;
    }

    if (fn.name === "IF") {
      const [condition, thenValue, elseValue] = renderArgs();
      return `CASE WHEN ${condition} THEN ${thenValue} ELSE ${elseValue} END`;
    }

    if (fn.name === "IFNULL") {
      return `COALESCE(${renderArgs().join(",")})`;
    }

    return super.escapeFunction(fn, options);
  }

  escapeLikeCondition(
    column: string,
    pattern: string,
    isLike: boolean,
    caseInsensitive: boolean
  ): string {
    const notPrefix = isLike ? "" : "NOT ";
    if (caseInsensitive) {
      // PostgreSQL: use native ILIKE
      return `${column} ${notPrefix}ILIKE ${pattern}`;
    }
    return `${column} ${notPrefix}LIKE ${pattern}`;
  }
}
