import { ISequelizableOptions } from "../interfaces";
import {
  ExpressionBase,
  ExpressionValue,
  FunctionExpression,
  OperationExpression,
  ValueExpression,
} from "../Expression";
import { DefaultFlavor } from "./default";

export class PostgresFlavor extends DefaultFlavor {
  /** @internal Installed on the per-render flavor by the binding renderer. */
  onBindingCast?: (placeholder: string, cast: string) => void;

  parameterPlaceholder(index: number): string {
    return `$${index}`;
  }

  escapeBoundValue(placeholder: string, value: unknown): string {
    if (typeof value === "number" && !Number.isInteger(value)) {
      const sql = `${placeholder}::numeric`;
      this.onBindingCast?.(placeholder, sql);
      return sql;
    }
    return placeholder;
  }

  protected columnQuotes = '"';
  protected stringQuotes = "'";

  private escapeTypedLiteral(
    expression: ExpressionBase,
    options?: ISequelizableOptions
  ): string {
    if (!this.bindValue || !(expression instanceof ValueExpression)) {
      return expression.toSQL(this, options);
    }
    const value = expression.value;
    let type: string;
    if (typeof value === "string") type = "TEXT";
    else if (typeof value === "boolean") type = "boolean";
    else if (typeof value === "bigint") type = "bigint";
    else if (typeof value === "number") {
      type = Number.isInteger(value)
        ? value >= -2147483648 && value <= 2147483647
          ? "integer"
          : "bigint"
        : "numeric";
    } else {
      // Leave null and Date parameters to their context (Date handling is #22).
      return expression.toSQL(this, options);
    }
    // Bind explicitly typed literals directly so the general hook cannot add
    // another cast around the same placeholder.
    const placeholder = this.bindValue(value);
    const sql =
      type === "TEXT"
        ? `CAST(${placeholder} AS TEXT)`
        : `${placeholder}::${type}`;
    this.onBindingCast?.(placeholder, sql);
    return sql;
  }

  private renderArguments(
    values: ExpressionValue[],
    options?: ISequelizableOptions,
    variadicAny = false
  ): string[] {
    const args = values.map((value) => ExpressionBase.deserialize(value));
    // A non-literal sibling supplies context; CONCAT's "any" arguments do not.
    const typeLiterals =
      this.bindValue &&
      (variadicAny || args.every((arg) => arg instanceof ValueExpression));
    return args.map((arg) =>
      typeLiterals
        ? this.escapeTypedLiteral(arg, options)
        : arg.toSQL(this, options)
    );
  }

  escapeSelectField(
    field: ExpressionBase,
    options?: ISequelizableOptions
  ): string {
    return this.escapeTypedLiteral(field, options);
  }

  escapeOperation(
    fn: OperationExpression,
    options?: ISequelizableOptions
  ): string {
    return `(${this.renderArguments(fn.value, options).join(
      ` ${fn.operation} `
    )})`;
  }

  escapeFunction(
    fn: FunctionExpression,
    options?: ISequelizableOptions
  ): string {
    const renderArgs = () =>
      this.renderArguments(
        fn.value,
        options,
        fn.name.toUpperCase() === "CONCAT"
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
      const date = ExpressionBase.deserialize(fn.value[0]).toSQL(this, options);
      if (this.bindValue) {
        return `(${date} + CAST(${this.bindValue(
          `${interval} ${intervalType}`
        )} AS INTERVAL))`;
      }
      return `(${date} + INTERVAL '${interval} ${intervalType}')`;
    }

    if (fn.name === "YEAR") {
      return `EXTRACT(YEAR FROM ${renderArgs().join(", ")})`;
    }

    if (fn.name === "MONTH") {
      return `EXTRACT(MONTH FROM ${renderArgs().join(", ")})`;
    }

    if (fn.name === "IF") {
      const condition = ExpressionBase.deserialize(fn.value[0]).toSQL(
        this,
        options
      );
      const [thenValue, elseValue] = this.renderArguments(
        fn.value.slice(1),
        options
      );
      return `CASE WHEN ${condition} THEN ${thenValue} ELSE ${elseValue} END`;
    }

    if (fn.name === "IFNULL") {
      return `COALESCE(${renderArgs().join(",")})`;
    }

    return `${fn.name}(${renderArgs().join(",")})`;
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
