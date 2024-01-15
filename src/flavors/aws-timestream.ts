import { MySQLFlavor } from "./mysql";

export class AWSTimestreamFlavor extends MySQLFlavor {
  protected columnQuotes = `"`;
  protected stringQuotes = `'`;
}
