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
  let sql = result.sql;
  // Work backwards so removing a cast cannot shift later recorded locations.
  // Authored casts and casts inserted outside the flavor's typing path survive.
  for (const cast of [...getGeneratedBindingCasts(result)].reverse()) {
    // Timestream's timestamp cast carries the Date's public SQL type. Keep it
    // for the literal-only textual normalization below instead of erasing it.
    if (cast.sql === `CAST(${cast.placeholder} AS TIMESTAMP)`) continue;
    if (sql.slice(cast.start, cast.start + cast.sql.length) !== cast.sql)
      continue;
    sql =
      sql.slice(0, cast.start) +
      cast.placeholder +
      sql.slice(cast.start + cast.sql.length);
  }
  return (
    sql
      .replace(
        /('(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\$\d+|\?)/g,
        (token) => {
          if (token[0] !== "?" && token[0] !== "$") return token;
          const position =
            token[0] === "$" ? Number(token.slice(1)) - 1 : index++;
          const value = result.bindings[position];
          if (value instanceof Date && flavor.formatDateValue) {
            // Reformatting a raw Date here would hide a binding regression.
            throw new Error("Date bindings must be formatted strings");
          }
          return flavor.escapeValue(value as any);
        }
      )
      .replace(/CAST\(('(?:''|[^'])*') AS INTERVAL\)/g, "INTERVAL $1")
      // Timestream's varchar-to-timestamp cast and inline TIMESTAMP literal are
      // equivalent; normalize only their SQL text, without original Date values.
      .replace(/CAST\(('(?:''|[^'])*') AS TIMESTAMP\)/g, "TIMESTAMP $1")
  );
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
