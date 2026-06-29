import { Condition, Cond } from "./Condition";
import { Q } from "./Query";
import { MySQLFlavor } from "./flavors/mysql";

const flavor = new MySQLFlavor();

const roundtrip = (cond: Condition): Condition =>
  Condition.deserialize(cond.serialize())!;

describe("Cond.in with subquery", () => {
  const buildSubquery = () =>
    Q.select().field("c").from("users").where(Cond.equal("active", 1));

  it("toSQL produces `field IN (SELECT ...)` for a direct subquery", () => {
    const cond = Cond.in("x", buildSubquery());
    expect(cond.toSQL(flavor)).toEqual(
      "`x` IN (SELECT `c` FROM `users` WHERE `active` = 1)"
    );
  });

  it("round-trips a subquery identically through serialize/deserialize", () => {
    const cond = Cond.in("x", buildSubquery());
    const expected = cond.toSQL(flavor);
    const restored = roundtrip(cond);
    expect(restored.toSQL(flavor)).toEqual(expected);
    expect(restored.toSQL(flavor)).toEqual(
      "`x` IN (SELECT `c` FROM `users` WHERE `active` = 1)"
    );
  });

  it("survives a full query serialize round-trip (does NOT drop the WHERE)", () => {
    const q = Q.select()
      .field("id")
      .from("t")
      .where(Cond.in("x", buildSubquery()));
    const expected = q.toSQL(flavor);
    const restored = Q.deserialize(q.serialize()) as any;
    expect(restored.toSQL(flavor)).toEqual(expected);
    expect(restored.toSQL(flavor)).toContain("WHERE `x` IN (SELECT");
  });

  it("also accepts a single-element array containing a subquery", () => {
    const cond = Cond.in("x", [buildSubquery()] as any);
    expect(cond.toSQL(flavor)).toEqual(
      "`x` IN (SELECT `c` FROM `users` WHERE `active` = 1)"
    );
    expect(roundtrip(cond).toSQL(flavor)).toEqual(cond.toSQL(flavor));
  });

  it("notIn supports subqueries and round-trips", () => {
    const cond = Cond.notIn("x", buildSubquery() as any);
    expect(cond.toSQL(flavor)).toEqual(
      "`x` NOT IN (SELECT `c` FROM `users` WHERE `active` = 1)"
    );
    expect(roundtrip(cond).toSQL(flavor)).toEqual(cond.toSQL(flavor));
  });
});

describe("Cond.in fail-closed for empty/null values", () => {
  it("empty array produces `field IN (NULL)` instead of dropping the filter", () => {
    const cond = Cond.in("foo", []);
    expect(cond).not.toBeNull();
    expect(cond.toSQL(flavor)).toEqual("`foo` IN (NULL)");
  });

  it("null values produce `field IN (NULL)` (fail-closed)", () => {
    const cond = Cond.in("foo", null);
    expect(cond).not.toBeNull();
    expect(cond.toSQL(flavor)).toEqual("`foo` IN (NULL)");
  });

  it("fail-closed condition survives serialize round-trip", () => {
    const cond = Cond.in("foo", []);
    expect(roundtrip(cond).toSQL(flavor)).toEqual("`foo` IN (NULL)");
  });

  it("empty IN never disappears from a serialized query (no data leak)", () => {
    const q = Q.select().field("id").from("t").where(Cond.in("foo", []));
    const restored = Q.deserialize(q.serialize()) as any;
    expect(restored.toSQL(flavor)).toContain("WHERE `foo` IN (NULL)");
  });

  it("notIn empty array is fail-closed and valid SQL", () => {
    const cond = Cond.notIn("foo", []);
    expect(cond.toSQL(flavor)).toEqual("`foo` NOT IN (NULL)");
    expect(roundtrip(cond).toSQL(flavor)).toEqual("`foo` NOT IN (NULL)");
  });
});

describe("Cond.in non-empty arrays are unchanged", () => {
  it("preserves numeric value lists", () => {
    const cond = Cond.in("foo", [1, 2, 3]);
    expect(cond.toSQL(flavor)).toEqual("`foo` IN (1, 2, 3)");
    expect(roundtrip(cond).toSQL(flavor)).toEqual("`foo` IN (1, 2, 3)");
  });

  it("preserves string value lists", () => {
    const cond = Cond.in("type", ["A", "B"]);
    expect(cond.toSQL(flavor)).toEqual('`type` IN ("A", "B")');
    expect(roundtrip(cond).toSQL(flavor)).toEqual('`type` IN ("A", "B")');
  });
});
