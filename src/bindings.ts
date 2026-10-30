import { ExpressionValue } from "./Expression";
import { ISQLFlavor } from "./Flavor";
import { Q } from "./Query";
import { ISequelizable, ISequelizableOptions } from "./interfaces";

export interface SQLWithBindings {
  sql: string;
  bindings: unknown[];
}

interface GeneratedBindingCast {
  start: number;
  sql: string;
  placeholder: string;
}

// Keep verification metadata separate from the public { sql, bindings } result.
const generatedBindingCasts = new WeakMap<
  SQLWithBindings,
  GeneratedBindingCast[]
>();

/** @internal Exact generated cast locations, used by the test parity harness. */
export const getGeneratedBindingCasts = (
  result: SQLWithBindings
): readonly GeneratedBindingCast[] => generatedBindingCasts.get(result) ?? [];

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
  const casts = new Map<string, string>();
  boundFlavor.onBindingCast = (placeholder, cast) =>
    casts.set(placeholder, cast);
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
  const generatedCasts: GeneratedBindingCast[] = [];
  let offsetDelta = 0;
  const sql = rendered.replace(
    /\u0000tsq\([a-z0-9]+:(\d+)\)\u0000/g,
    (token, index, offset) => {
      if (!token.startsWith(prefix)) return token;
      bindings.push(values[Number(index)]);
      const placeholder = flavor.parameterPlaceholder?.(bindings.length) ?? "?";
      const cast = casts.get(token);
      if (cast) {
        const start = offset - cast.indexOf(token);
        if (rendered.slice(start, start + cast.length) === cast) {
          generatedCasts.push({
            start: start + offsetDelta,
            sql: cast.replace(token, placeholder),
            placeholder,
          });
        }
      }
      offsetDelta += placeholder.length - token.length;
      return placeholder;
    }
  );
  const result = { sql, bindings };
  generatedBindingCasts.set(result, generatedCasts);
  return result;
}
