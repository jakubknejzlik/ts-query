import dayjs, { Dayjs } from "dayjs";
import { Cond, Condition } from "./Condition";
import {
  Expression,
  ExpressionValue,
  FunctionExpression,
  OperationExpression,
} from "./Expression";
import { Q } from "./Query";

const formatDayjs = (d: Dayjs | string) =>
  dayjs(d).format("YYYY-MM-DD HH:mm:ss");

const ifFn = (
  condition: Condition,
  trueValue: ExpressionValue,
  falseValue: ExpressionValue
) => {
  return new FunctionExpression("IF", condition, trueValue, falseValue);
};

const dateAddFn = (
  date: ExpressionValue,
  value: ExpressionValue,
  interval: "year" | "month" | "day"
) => {
  return new FunctionExpression("DATEADD", date, value, interval);
};

export const Function = {
  count: (column: ExpressionValue) => {
    return new FunctionExpression("COUNT", column);
  },
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
    interval: "year" | "month" | "day" | "hour" | "minute" | "second",
    date1: ExpressionValue,
    date2: ExpressionValue
  ) => {
    if (interval === "month") {
      return Q.expr(
        `TIMESTAMPDIFF(MONTH, ${Expression.escapeExpressionValue(
          date1
        )}, ${Expression.escapeExpressionValue(date2)})`
      );
    } else if (interval === "day") {
      return new FunctionExpression("DATEDIFF", date1, date2);
    } else {
      return new OperationExpression(
        "-",
        Function.year(date1),
        Function.year(date2)
      );
    }
  },
  formatDate: (date: Dayjs) => {
    return Q.expr(`'${formatDayjs(date)}'`);
  },
  substring: (
    string: string,
    start: ExpressionValue,
    length: ExpressionValue
  ) => {
    return new FunctionExpression(
      "SUBSTRING",
      string,
      Q.value(start),
      Q.value(length)
    );
  },
  string: (value: string) => {
    return Q.expr(Expression.escapeString(`${value}`));
  },
  null: () => {
    return Q.expr(`NULL`);
  },
  ifnull: (name: ExpressionValue, value: ExpressionValue) => {
    return new FunctionExpression("IFNULL", name, value);
  },
  concat: (...values: ExpressionValue[]) => {
    return new FunctionExpression("CONCAT", ...values);
  },
  if: ifFn,
  dateAdd: dateAddFn,
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
        Cond.between(dateColumn, [dayjs(start), dayjs(end)]),
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
