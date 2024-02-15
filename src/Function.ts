import dayjs, { Dayjs } from "dayjs";
import { Cond, Condition } from "./Condition";
import {
  Expression,
  ExpressionValue,
  FunctionExpression,
  OperationExpression,
} from "./Expression";
import { Q } from "./Query";
import { MySQLFlavor } from "./flavors/mysql";

const formatDayjs = (dayjs: Dayjs) => dayjs.format("YYYY-MM-DD");

const ifFn = (
  condition: Condition,
  trueValue: ExpressionValue,
  falseValue: ExpressionValue
) => {
  return new FunctionExpression("IF", condition, trueValue, falseValue);
};

export const Function = {
  add: (...columns: ExpressionValue[]) => {
    return new OperationExpression("+", ...columns);
  },
  subtract: (...columns: ExpressionValue[]) => {
    return new OperationExpression("-", ...columns);
  },
  divide: (...columns: ExpressionValue[]) => {
    return new OperationExpression("/", ...columns);
  },
  multiply: (...columns: ExpressionValue[]) => {
    return new OperationExpression("*", ...columns);
  },
  sum: (column: ExpressionValue) => {
    return new FunctionExpression("SUM", column);
  },
  year: (column: ExpressionValue) => {
    return new FunctionExpression("YEAR", column);
  },
  month: (column: ExpressionValue) => {
    return new FunctionExpression("MONTH", column);
  },
  min: (column: ExpressionValue) => {
    return new FunctionExpression("MIN", column);
  },
  max: (column: ExpressionValue) => {
    return new FunctionExpression("MAX", column);
  },
  avg: (column: ExpressionValue) => {
    return new FunctionExpression("AVG", column);
  },
  abs: (column: ExpressionValue) => {
    return new FunctionExpression("ABS", column);
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
    return new FunctionExpression("CONCAT", ...values);
  },
  if: ifFn,
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
  }) => {
    return new FunctionExpression(
      "SUM",
      new FunctionExpression(
        "IF",
        Cond.between(dateColumn, [
          formatDayjs(dayjs(start)),
          formatDayjs(dayjs(end)),
        ]),
        valueColumn,
        Q.value(0)
      )
    );
  },

  priceCurrentAndPreviousDiffField: ({
    thisYearColumn,
    lastYearColumn,
  }: {
    thisYearColumn: ExpressionValue;
    lastYearColumn: ExpressionValue;
  }) =>
    ifFn(
      Cond.and([Cond.equal(thisYearColumn, 0), Cond.equal(lastYearColumn, 0)]),
      Q.expr(`+0`),
      ifFn(
        Cond.equal(lastYearColumn, 0),
        Q.expr("NULL"),
        ifFn(
          Cond.equal(thisYearColumn, 0),
          Q.expr(`-1`),
          new OperationExpression(
            "/",
            new OperationExpression("-", thisYearColumn, lastYearColumn),
            lastYearColumn
          )
        )
      )
    ),
};

export { Function as Fn };
