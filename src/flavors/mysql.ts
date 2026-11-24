import { FlavorCapabilities, flavorCapabilities } from "../capabilities";
import { DefaultFlavor } from "./default";

export class MySQLFlavor extends DefaultFlavor {
  readonly capabilities: FlavorCapabilities = flavorCapabilities.mysql;
}
