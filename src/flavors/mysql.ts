import { isDayjs } from "dayjs";
import { ConditionValue } from "../Condition";
import { ISQLFlavor } from "../Flavor";
import { SelectQuery } from "../Query";

export class MySQLFlavor implements ISQLFlavor {
  protected columnQuotes = "`";
  protected stringQuotes = `"`;

  escapeColumn(name: string, legacyParsing?: boolean): string {
    if (name === "NULL") {
      return name;
    }
    if (legacyParsing) {
      const columnMatch = name.match(/^[\.a-zA-Z0-9_]+$/);
      if (columnMatch) {
        return `${this.columnQuotes}${name
          .replace(
            new RegExp(`/${this.columnQuotes}/`, "g"),
            `${this.columnQuotes}${this.columnQuotes}`
          )
          .split(".")
          .join(`${this.columnQuotes}.${this.columnQuotes}`)}${
          this.columnQuotes
        }`;
      }
      return `${name}`;
    }
    return `${this.columnQuotes}${name
      .split(".")
      .join(`${this.columnQuotes}.${this.columnQuotes}`)}${this.columnQuotes}`;
  }

  escapeTable(table: string): string {
    if (table.indexOf("-") !== -1) {
      return `${this.columnQuotes}${table}${this.columnQuotes}`;
    }
    return this.escapeColumn(table);
  }

  escapeValue(value: ConditionValue): string {
    if (isDayjs(value)) {
      return `${this.stringQuotes}${value.format("YYYY-MM-DD HH:mm:ss")}${
        this.stringQuotes
      }`;
    }
    if (typeof value === "string") {
      return `${this.stringQuotes}${value}${this.stringQuotes}`;
    }
    return `${value}`;
  }

  escapeLimitAndOffset(limit?: number, offset?: number): string {
    let str = "";
    if (limit !== undefined) {
      str += ` LIMIT ${limit}`;
    }
    if (offset !== undefined) {
      str += ` OFFSET ${offset}`;
    }
    return str;
  }
}
