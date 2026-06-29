import { Q, Cond } from "./index";
import { MySQLFlavor } from "./flavors/mysql";
import { TableSource } from "./Query";

const flavor = new MySQLFlavor();

/**
 * Verifies that the `Cond.in` fix (subquery support + fail-closed empty list)
 * bubbles correctly through the `transformTable` render path — the exact
 * mechanism reporting-api uses to enforce row-level security by replacing a
 * table reference with a derived table carrying a WHERE filter.
 *
 * ARCHITECTURAL NOTE: `transformTable` is a *render-time* option on `toSQL`
 * (see ISequelizableOptions), NOT part of the query state. It is therefore
 * never serialized. The realistic reporting-api flow is:
 *   1. build + serialize the BASE query, send it over the wire,
 *   2. deserialize it,
 *   3. render with `toSQL(flavor, { transformTable })`, where the transform
 *      callback (containing the RLS `Cond.in`) is supplied fresh at render time.
 *
 * The fix matters here in two ways:
 *   (a) toSQL correctness of the transform-produced derived table — before the
 *       fix a *direct* `Cond.in(field, subquery)` returned null, so the derived
 *       table would have had NO filter and leaked every row;
 *   (b) round-trip survival if the derived SelectQuery itself is ever serialized.
 */
describe("Cond.in via transformTable (reporting-api RLS pattern)", () => {
  const email = "user@example.com";

  // RLS rule: replace a table with `SELECT x.* FROM <table> x WHERE x.centre_code IN (SELECT centre FROM users WHERE email = ...)`
  const rlsSubquery = (table: TableSource): TableSource =>
    Q.select()
      .addField("x.*")
      .from(table as string, "x")
      .where(
        Cond.in(
          "x.centre_code",
          Q.select()
            .field("centre")
            .from("users")
            .where(Cond.equal("email", email))
        )
      );

  // Fail-closed rule: no allowed centres → empty IN.
  const rlsEmpty = (table: TableSource): TableSource =>
    Q.select()
      .addField("x.*")
      .from(table as string, "x")
      .where(Cond.in("x.centre_code", []));

  // Realistic-ish base query (aggregation) reading from the protected table.
  const buildBase = () =>
    Q.select().field("x.centre_code").from("naklady").groupBy("x.centre_code");

  const EXPECTED_SUBQUERY =
    "SELECT `x`.`centre_code` FROM (SELECT `x`.* FROM `naklady` AS `x` " +
    'WHERE `x`.`centre_code` IN (SELECT `centre` FROM `users` WHERE `email` = "user@example.com")) ' +
    "AS `t` GROUP BY `x`.`centre_code`";

  const EXPECTED_EMPTY =
    "SELECT `x`.`centre_code` FROM (SELECT `x`.* FROM `naklady` AS `x` " +
    "WHERE `x`.`centre_code` IN (NULL)) AS `t` GROUP BY `x`.`centre_code`";

  it("toSQL: subquery filter lands inside the derived-table replacement", () => {
    const sql = buildBase().toSQL(flavor, { transformTable: rlsSubquery });
    expect(sql).toEqual(EXPECTED_SUBQUERY);
    expect(sql).toContain(
      'IN (SELECT `centre` FROM `users` WHERE `email` = "user@example.com")'
    );
  });

  it("serialize → deserialize → toSQL(transformTable): WHERE/IN survives (does NOT drop)", () => {
    const base = buildBase();
    const direct = base.toSQL(flavor, { transformTable: rlsSubquery });

    // Round-trip the BASE query (transformTable is applied fresh after deserialize,
    // exactly as reporting-api does it).
    const restored = Q.deserialize(base.serialize()) as any;
    const afterRoundtrip = restored.toSQL(flavor, {
      transformTable: rlsSubquery,
    });

    expect(afterRoundtrip).toEqual(direct);
    expect(afterRoundtrip).toContain("IN (SELECT `centre` FROM `users`");
  });

  it("the transform-produced derived table itself survives a serialize round-trip", () => {
    // Strongest proof: if the RLS derived query is persisted/round-tripped,
    // the Cond.in subquery is preserved (directly exercises the fix).
    const derived = rlsSubquery("naklady") as any;
    const restored = Q.deserialize(derived.serialize()) as any;
    expect(restored.toSQL(flavor)).toEqual(derived.toSQL(flavor));
    expect(restored.toSQL(flavor)).toContain(
      'IN (SELECT `centre` FROM `users` WHERE `email` = "user@example.com")'
    );
  });

  it("fail-closed: empty IN renders `IN (NULL)` inside the derived table (no data leak)", () => {
    const sql = buildBase().toSQL(flavor, { transformTable: rlsEmpty });
    expect(sql).toEqual(EXPECTED_EMPTY);
    expect(sql).toContain("IN (NULL)");
    // The filter must never vanish — that would expose all rows through the transform.
    expect(sql).not.toEqual("SELECT `x`.`centre_code` FROM `naklady` GROUP BY `x`.`centre_code`");
  });

  it("fail-closed survives serialize → deserialize → toSQL(transformTable)", () => {
    const base = buildBase();
    const restored = Q.deserialize(base.serialize()) as any;
    const sql = restored.toSQL(flavor, { transformTable: rlsEmpty });
    expect(sql).toEqual(EXPECTED_EMPTY);
    expect(sql).toContain("IN (NULL)");
  });
});
