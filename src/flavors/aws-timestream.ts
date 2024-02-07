import { MySQLFlavor } from "./mysql";

export class AWSTimestreamFlavor extends MySQLFlavor {
  protected columnQuotes = `"`;
  protected stringQuotes = `'`;
  escapeLimitAndOffset(limit?: number, offset?: number): string {
    let str = "";
    if (offset !== undefined) {
      str += ` OFFSET ${offset}`;
    }
    if (limit !== undefined) {
      str += ` LIMIT ${limit}`;
    }
    return str;
  }
}
