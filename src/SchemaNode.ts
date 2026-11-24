import type { ISQLFlavor } from "./Flavor";
import type { SQLWithBindings } from "./bindings";
import type {
  IMetadata,
  ISequelizable,
  ISerializable,
  ISerializableOptions,
} from "./interfaces";
import { MetadataOperationType, OperationType } from "./interfaces";
import { compressString } from "./compression";
import { validateSchemaNode } from "./schema-validation";

/** Shared wire/binding contract; schema nodes contain no executable expressions. */
export abstract class SchemaNode
  implements ISerializable, ISequelizable, IMetadata
{
  abstract toJSON(): { type: OperationType };
  abstract toSQL(flavor?: ISQLFlavor): string;
  abstract getOperationType(): MetadataOperationType;
  abstract getTableNames(): string[];
  serialize(opts: ISerializableOptions = {}): string {
    const node = this.toJSON();
    validateSchemaNode(node);
    const json = JSON.stringify(opts.version === 1 ? { v: 1, ...node } : node);
    return opts.compress ? compressString(json) : json;
  }
  abstract toSQLWithBindings(flavor?: ISQLFlavor): SQLWithBindings;
}
