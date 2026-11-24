import {
  ExpressionBase,
  ExpressionValue,
  FunctionExpression,
} from "../Expression";
import { ISequelizableOptions } from "../interfaces";
import { flavorCapabilities } from "../capabilities";
import { DefaultFlavor } from "./default";

/** DuckDB uses one-based $n parameters and ANSI quoted identifiers. */
export class DuckDBFlavor extends DefaultFlavor {
  readonly capabilities = flavorCapabilities.duckdb;
  protected columnQuotes = '"';
  protected stringQuotes = "'";
  onBindingCast?: (placeholder: string, cast: string) => void;
  parameterPlaceholder(index: number): string {
    return `$${index}`;
  }
  escapeColumn(name: string, _legacy?: boolean): string {
    return name
      .split(".")
      .map((part) => (part === "*" ? "*" : `"${part.replace(/"/g, '""')}"`))
      .join(".");
  }
  escapeTable(name: string): string {
    return this.escapeColumn(name);
  }
  escapeBoundValue(placeholder: string, value: unknown): string {
    if (value instanceof Date) {
      const sql = `CAST(${placeholder} AS TIMESTAMP)`;
      this.onBindingCast?.(placeholder, sql);
      return sql;
    }
    return placeholder;
  }
  escapeValue(value: ExpressionValue): string {
    return value instanceof Date
      ? `TIMESTAMP '${this.formatDateValue(value)}'`
      : super.escapeValue(value);
  }
  escapeFunction(
    fn: FunctionExpression,
    options?: ISequelizableOptions
  ): string {
    const name = fn.name.toUpperCase();
    const args = () =>
      fn.value.map((arg) =>
        ExpressionBase.deserialize(arg).toSQL(this, options)
      );
    if (name === "DATEADD") {
      const amount = Number(ExpressionBase.deserializeValue(fn.value[1]).value);
      const unit = String(
        ExpressionBase.deserializeValue(fn.value[2]).value
      ).toLowerCase();
      if (!Number.isSafeInteger(amount))
        throw new Error("Invalid DATEADD interval");
      if (
        !["year", "month", "day", "hour", "minute", "second", "week"].includes(
          unit
        )
      )
        throw new Error("Invalid DATEADD interval type");
      const date = ExpressionBase.deserialize(fn.value[0]).toSQL(this, options);
      if (this.bindValue) {
        const placeholder = this.bindValue(`${amount} ${unit}`);
        const sql = `CAST(${placeholder} AS INTERVAL)`;
        this.onBindingCast?.(placeholder, sql);
        return `(${date} + ${sql})`;
      }
      return `(${date} + INTERVAL '${amount} ${unit}')`;
    }
    if (name === "YEAR" || name === "MONTH")
      return `EXTRACT(${name} FROM ${args().join(", ")})`;
    if (name === "IF") {
      const [condition, thenValue, elseValue] = args();
      return `CASE WHEN ${condition} THEN ${thenValue} ELSE ${elseValue} END`;
    }
    if (name === "IFNULL") return `COALESCE(${args().join(",")})`;
    return `${fn.name}(${args().join(",")})`;
  }
  escapeLikeCondition(
    column: string,
    pattern: string,
    isLike: boolean,
    caseInsensitive: boolean
  ): string {
    return `${column} ${isLike ? "" : "NOT "}${
      caseInsensitive ? "ILIKE" : "LIKE"
    } ${pattern}`;
  }
}
