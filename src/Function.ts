import dayjs, { Dayjs } from "dayjs";
import { Condition } from "./Condition";
import { ISQLFlavor } from "./Flavor";
import { MySQLFlavor } from "./flavors/mysql";
import { Expression, ExpressionOrString } from "./Expression";
import { Q } from "./Query";

const formatDayjs = (dayjs: Dayjs) => dayjs.format("YYYY-MM-DD");
const defaultFlavor = new MySQLFlavor();

export const Function = {
  sum: (column: ExpressionOrString) => {
    return Q.expr(`SUM(${Expression.fromColumnOrExpression(column)})`);
  },
  year: (column: ExpressionOrString) => {
    return Q.expr(`YEAR(${Expression.fromColumnOrExpression(column)})`);
  },
  month: (column: ExpressionOrString) => {
    return Q.expr(`MONTH(${Expression.fromColumnOrExpression(column)})`);
  },
  min: (column: ExpressionOrString) => {
    return Q.expr(`MIN(${Expression.fromColumnOrExpression(column)})`);
  },
  max: (column: ExpressionOrString) => {
    return Q.expr(`MAX(${Expression.fromColumnOrExpression(column)})`);
  },
  avg: (column: ExpressionOrString) => {
    return Q.expr(`AVG(${Expression.fromColumnOrExpression(column)})`);
  },
  abs: (column: ExpressionOrString) => {
    return Q.expr(`ABS(${Expression.fromColumnOrExpression(column)})`);
  },
  dateDiff: (
    interval: "year" | "month" | "day",
    date1: ExpressionOrString,
    date2: ExpressionOrString
  ) => {
    if (interval === "month") {
      return Q.expr(
        `TIMESTAMPDIFF(MONTH,${Expression.fromColumnOrExpression(
          date1
        )}, ${Expression.fromColumnOrExpression(date2)})`
      );
    } else if (interval === "day") {
      return Q.expr(
        `DATEDIFF(${Expression.fromColumnOrExpression(
          date1
        )}, ${Expression.fromColumnOrExpression(date2)})`
      );
    } else {
      return Q.expr(
        `YEAR(${Expression.fromColumnOrExpression(
          date1
        )}) - YEAR(${Expression.fromColumnOrExpression(date2)})`
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
  ifnull: (name: ExpressionOrString, value: ExpressionOrString) => {
    return Q.expr(
      `IFNULL(${Expression.fromColumnOrExpression(name)},${
        typeof value === "string"
          ? value
          : Expression.fromColumnOrExpression(value)
      })`
    );
  },
  concat: (...values: ExpressionOrString[]) => {
    return Q.expr(
      `CONCAT(${values
        .map((x) => Expression.fromColumnOrExpression(x))
        .join(",")})`
    );
  },
  if: (
    condition: Condition,
    trueValue: ExpressionOrString,
    falseValue: ExpressionOrString,
    flavor: ISQLFlavor = defaultFlavor
  ) => {
    return `IF(${condition.toSQL(flavor)},${Expression.fromColumnOrExpression(
      trueValue
    )},${Expression.fromColumnOrExpression(falseValue)})`;
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
    `SUM(IF(${dateColumn} BETWEEN '${formatDayjs(
      dayjs(start)
    )}' AND '${formatDayjs(dayjs(end))}',${valueColumn},0))`,

  priceCurrentAndPreviousDiffField: ({
    thisYearColumn,
    lastYearColumn,
  }: {
    thisYearColumn: ExpressionOrString;
    lastYearColumn: ExpressionOrString;
  }) =>
    Q.expr(
      "CASE " +
        `WHEN ${Expression.fromColumnOrExpression(
          thisYearColumn
        )} = 0 AND ${Expression.fromColumnOrExpression(
          lastYearColumn
        )} = 0 THEN 0 ` +
        `WHEN ${Expression.fromColumnOrExpression(
          lastYearColumn
        )} = 0 THEN null ` +
        `WHEN ${Expression.fromColumnOrExpression(
          thisYearColumn
        )} = 0 THEN -1 ` +
        `ELSE (${Expression.fromColumnOrExpression(
          thisYearColumn
        )} - ${Expression.fromColumnOrExpression(
          lastYearColumn
        )}) / ${Expression.fromColumnOrExpression(lastYearColumn)} ` +
        "END"
    ),
};

export { Function as Fn };
