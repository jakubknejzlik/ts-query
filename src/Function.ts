import dayjs, { Dayjs } from "dayjs";
import { Condition } from "./Condition";
import { ISQLFlavor } from "./Flavor";
import { MySQLFlavor } from "./flavors/mysql";
import { Expression, ExpressionValue } from "./Expression";
import { Q } from "./Query";

const formatDayjs = (dayjs: Dayjs) => dayjs.format("YYYY-MM-DD");
const defaultFlavor = new MySQLFlavor();

export const Function = {
  sum: (column: ExpressionValue) => {
    return Q.expr(`SUM(${Expression.escapeExpressionValue(column)})`);
  },
  year: (column: ExpressionValue) => {
    return Q.expr(`YEAR(${Expression.escapeExpressionValue(column)})`);
  },
  month: (column: ExpressionValue) => {
    return Q.expr(`MONTH(${Expression.escapeExpressionValue(column)})`);
  },
  min: (column: ExpressionValue) => {
    return Q.expr(`MIN(${Expression.escapeExpressionValue(column)})`);
  },
  max: (column: ExpressionValue) => {
    return Q.expr(`MAX(${Expression.escapeExpressionValue(column)})`);
  },
  avg: (column: ExpressionValue) => {
    return Q.expr(`AVG(${Expression.escapeExpressionValue(column)})`);
  },
  abs: (column: ExpressionValue) => {
    return Q.expr(`ABS(${Expression.escapeExpressionValue(column)})`);
  },
  dateDiff: (
    interval: "year" | "month" | "day",
    date1: ExpressionValue,
    date2: ExpressionValue
  ) => {
    if (interval === "month") {
      return Q.expr(
        `TIMESTAMPDIFF(MONTH,${Expression.escapeExpressionValue(
          date1
        )}, ${Expression.escapeExpressionValue(date2)})`
      );
    } else if (interval === "day") {
      return Q.expr(
        `DATEDIFF(${Expression.escapeExpressionValue(
          date1
        )}, ${Expression.escapeExpressionValue(date2)})`
      );
    } else {
      return Q.expr(
        `YEAR(${Expression.escapeExpressionValue(
          date1
        )}) - YEAR(${Expression.escapeExpressionValue(date2)})`
      );
    }
  },
  formatDate: (date: Dayjs) => {
    return Q.expr(`'${formatDayjs(date)}'`);
  },
  string: (value: string) => {
    return Q.expr(Expression.escapeString(`${value}`));
  },
  null: () => {
    return Q.expr(`NULL`);
  },
  ifnull: (name: ExpressionValue, value: ExpressionValue) => {
    return Q.expr(
      `IFNULL(${Expression.escapeExpressionValue(name)},${
        typeof value === "string"
          ? value
          : Expression.escapeExpressionValue(value)
      })`
    );
  },
  concat: (...values: ExpressionValue[]) => {
    return Q.expr(
      `CONCAT(${values
        .map((x) => Expression.escapeExpressionValue(x))
        .join(",")})`
    );
  },
  if: (
    condition: Condition,
    trueValue: ExpressionValue,
    falseValue: ExpressionValue,
    flavor: ISQLFlavor = defaultFlavor
  ) => {
    return Q.expr(
      `IF(${condition.toSQL(flavor)},${Expression.escapeValue(
        trueValue
      )},${Expression.escapeValue(falseValue)})`
    );
  },
  dateRangeSumField: ({
    dateColumn,
    valueColumn,
    start,
    end,
  }: {
    dateColumn: string;
    valueColumn: string;
    start: Dayjs | string;
    end: Dayjs | string;
  }) =>
    Q.expr(
      `SUM(IF(${dateColumn} BETWEEN '${formatDayjs(
        dayjs(start)
      )}' AND '${formatDayjs(dayjs(end))}',${valueColumn},0))`
    ),

  priceCurrentAndPreviousDiffField: ({
    thisYearColumn,
    lastYearColumn,
  }: {
    thisYearColumn: ExpressionValue;
    lastYearColumn: ExpressionValue;
  }) =>
    Q.expr(
      "CASE " +
        `WHEN ${Expression.escapeExpressionValue(
          thisYearColumn
        )} = 0 AND ${Expression.escapeExpressionValue(
          lastYearColumn
        )} = 0 THEN 0 ` +
        `WHEN ${Expression.escapeExpressionValue(
          lastYearColumn
        )} = 0 THEN null ` +
        `WHEN ${Expression.escapeExpressionValue(
          thisYearColumn
        )} = 0 THEN -1 ` +
        `ELSE (${Expression.escapeExpressionValue(
          thisYearColumn
        )} - ${Expression.escapeExpressionValue(
          lastYearColumn
        )}) / ${Expression.escapeExpressionValue(lastYearColumn)} ` +
        "END"
    ),
};

export { Function as Fn };
