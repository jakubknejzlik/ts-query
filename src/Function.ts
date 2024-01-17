import dayjs, { Dayjs } from "dayjs";
import { Condition } from "./Condition";
import { ISQLFlavor } from "./Flavor";
import { MySQLFlavor } from "./flavors/mysql";

const formatDayjs = (dayjs: Dayjs) => dayjs.format("YYYY-MM-DD");
const defaultFlavor = new MySQLFlavor();

export const Function = {
  sum: (column: string) => {
    return `SUM(${column})`;
  },
  year: (column: string) => {
    return `YEAR(${column})`;
  },
  month: (column: string) => {
    return `MONTH(${column})`;
  },
  min: (column: string) => {
    return `MIN(${column})`;
  },
  max: (column: string) => {
    return `MAX(${column})`;
  },
  avg: (column: string) => {
    return `AVG(${column})`;
  },
  abs: (column: string) => {
    return `ABS(${column})`;
  },
  dateDiff: (
    interval: "year" | "month" | "day",
    date1: string,
    date2: string
  ) => {
    if (interval === "month") {
      return `TIMESTAMPDIFF(MONTH,${date1}, ${date2})`;
    } else if (interval === "day") {
      return `DATEDIFF(${date1}, ${date2})`;
    } else {
      return `YEAR(${date1}) - YEAR(${date2})`;
    }
  },
  formatDate: (date: Dayjs) => {
    return `'${formatDayjs(date)}'`;
  },
  string: (value: string) => {
    return `'${value}'`;
  },
  null: () => {
    return `NULL`;
  },
  ifnull: (name: string, value: string) => {
    return `IFNULL(${name},${value})`;
  },
  concat: (...values: string[]) => {
    return `CONCAT(${values.join(",")})`;
  },
  if: (
    condition: Condition,
    trueValue: string,
    falseValue: string,
    flavor: ISQLFlavor = defaultFlavor
  ) => {
    return `IF(${condition.toSQL(flavor)},${trueValue},${falseValue})`;
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
    thisYearColumn: string;
    lastYearColumn: string;
  }) =>
    "CASE " +
    `WHEN ${thisYearColumn} = 0 AND ${lastYearColumn} = 0 THEN 0 ` +
    `WHEN ${lastYearColumn} = 0 THEN null ` +
    `WHEN ${thisYearColumn} = 0 THEN -1 ` +
    `ELSE (${thisYearColumn} - ${lastYearColumn}) / ${lastYearColumn} ` +
    "END",
};

export { Function as Fn };
