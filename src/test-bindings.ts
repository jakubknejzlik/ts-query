import * as Conditions from "./Condition";
import * as Expressions from "./Expression";
import { SelectQuery, Table, Join, Q } from "./Query";
import { InsertMutation, UpdateMutation, DeleteMutation } from "./Mutation";
import { CreateTableAsSelect } from "./CreateTableAsSelect";
import { CreateViewAsSelect } from "./CreateViewAsSelect";
import {
  toSQLWithBindings,
  SQLWithBindings,
  getGeneratedBindingCasts,
} from "./bindings";
import { ISQLFlavor } from "./Flavor";

/** Substitute only SQL placeholders, never question marks inside quoted SQL. */
export function inlineBindings(
  result: SQLWithBindings,
  flavor: ISQLFlavor
): string {
  let index = 0;
  let cursor = 0;
  let sql = "";
  const usedBindings = new Set<number>();
  const tokens = /('(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\$\d+|\?)/g;
  const casts = new Map(
    getGeneratedBindingCasts(result).map((cast) => {
      // Scan independently so quoted placeholders cannot affect the key or
      // advance the tokenizer used to reconstruct the full query below.
      const castTokens = new RegExp(tokens);
      let match: RegExpExecArray | null;
      while ((match = castTokens.exec(cast.sql))) {
        if (match[0][0] === "?" || match[0][0] === "$")
          return [cast.start + match.index, cast] as const;
      }
      throw new Error("Missing SQL placeholder in generated cast");
    })
  );
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(result.sql))) {
    const token = match[0];
    if (token[0] !== "?" && token[0] !== "$") continue;
    const position = token[0] === "$" ? Number(token.slice(1)) - 1 : index++;
    if (position < 0 || position >= result.bindings.length)
      throw new Error(`Missing SQL binding for ${token}`);
    usedBindings.add(position);
    const value = result.bindings[position];
    if (value instanceof Date && flavor.formatDateValue) {
      // Reformatting a raw Date here would hide a binding regression.
      throw new Error("Date bindings must be formatted strings");
    }
    let literal = flavor.escapeValue(value as any);
    let start = match.index;
    let end = start + token.length;
    const cast = casts.get(start);
    // Only the flavor's recorded cast around this unquoted placeholder may
    // change. Authored casts and quoted data survive without normalization.
    if (
      cast?.placeholder === token &&
      result.sql.slice(cast.start, cast.start + cast.sql.length) === cast.sql
    ) {
      start = cast.start;
      end = start + cast.sql.length;
      const type = ["TIMESTAMP", "INTERVAL"].find(
        (type) => cast.sql === `CAST(${token} AS ${type})`
      );
      if (type) literal = `${type} ${literal}`;
    }
    sql += result.sql.slice(cursor, start) + literal;
    cursor = end;
  }
  if (usedBindings.size !== result.bindings.length)
    throw new Error("Unused SQL bindings");
  return sql + result.sql.slice(cursor);
}

// Every successful outermost toSQL call in the entire test corpus also asserts
// that parameterization reconstructs its existing inline result. The guard
// prevents checks on compiler internals and on the binding render itself.
let depth = 0;
let comparisons = 0;
const classes = [
  SelectQuery,
  Table,
  Join,
  InsertMutation,
  UpdateMutation,
  DeleteMutation,
  CreateTableAsSelect,
  CreateViewAsSelect,
  ...Object.values(Conditions),
  ...Object.values(Expressions),
];
for (const constructor of new Set(classes)) {
  const prototype = (constructor as any)?.prototype;
  if (!prototype || !Object.prototype.hasOwnProperty.call(prototype, "toSQL"))
    continue;
  const original = prototype.toSQL;
  prototype.toSQL = function (...args: any[]) {
    if (depth || args[0]?.bindValue) return original.apply(this, args);
    depth++;
    try {
      const sql = original.apply(this, args);
      const flavor = args[0] ?? Q.flavors.mysql;
      expect(
        inlineBindings(toSQLWithBindings(this, flavor, args[1]), flavor)
      ).toBe(sql);
      comparisons++;
      return sql;
    } finally {
      depth--;
    }
  };
}

export const getBindingComparisons = () => comparisons;
