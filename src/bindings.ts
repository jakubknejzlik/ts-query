import { ExpressionValue } from "./Expression";
import { ISQLFlavor } from "./Flavor";
import { Q } from "./Query";
import { ISequelizable, ISequelizableOptions } from "./interfaces";

export interface SQLWithBindings {
  sql: string;
  bindings: unknown[];
}

/** Render using the same compiler and transforms, without changing the supplied flavor. */
export function toSQLWithBindings(
  query: ISequelizable,
  flavor: ISQLFlavor = Q.flavors.mysql,
  options?: ISequelizableOptions
): SQLWithBindings {
  const values: unknown[] = [];
  // Resolve tokens after rendering: flavors may reorder or repeat function arguments.
  const prefix = `\u0000tsq(${Math.random().toString(36).slice(2) || "0"}:`;
  const bind = (value: unknown): string => {
    values.push(value);
    return `${prefix}${values.length - 1})\u0000`;
  };
  const boundFlavor: ISQLFlavor = Object.create(flavor);
  boundFlavor.bindValue = bind;
  boundFlavor.escapeValue = (value: ExpressionValue) => bind(value);
  // Older builders use a raw NULL node for UPDATE nulls, empty IN and VALUES.
  boundFlavor.escapeRawValue = (value) =>
    value === "NULL"
      ? bind(null)
      : flavor.escapeRawValue.call(boundFlavor, value);
  boundFlavor.escapeLimitAndOffset = (limit, offset) =>
    flavor.escapeLimitAndOffset.call(
      boundFlavor,
      limit === undefined ? undefined : (bind(limit) as any),
      offset === undefined ? undefined : (bind(offset) as any)
    );
  const rendered = query.toSQL(boundFlavor, options);
  const bindings: unknown[] = [];
  const sql = rendered.replace(
    /\u0000tsq\([a-z0-9]+:(\d+)\)\u0000/g,
    (token, index) => {
      if (!token.startsWith(prefix)) return token;
      bindings.push(values[Number(index)]);
      return flavor.parameterPlaceholder?.(bindings.length) ?? "?";
    }
  );
  return { sql, bindings };
}
