import { DefaultFlavor } from "./default";

export class AWSTimestreamFlavor extends DefaultFlavor {
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
