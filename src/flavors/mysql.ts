import { isDayjs } from "dayjs";
import { ConditionValue } from "../Condition";
import { ISQLFlavor } from "../Flavor";

export class MySQLFlavor implements ISQLFlavor {
  protected columnQuotes = "`";
  protected stringQuotes = `"`;

  escapeColumn(name: string): string {
    if (name === "NULL") {
      return name;
    }
    const columnMatch = name.match(/^[\.a-zA-Z0-9_]+$/);
    if (columnMatch) {
      return `${this.columnQuotes}${name
        .replace(
          new RegExp(`/${this.columnQuotes}/`, "g"),
          `${this.columnQuotes}${this.columnQuotes}`
        )
        .split(".")
        .join("`.`")}${this.columnQuotes}`;
    }
    return `${name}`;
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
}
