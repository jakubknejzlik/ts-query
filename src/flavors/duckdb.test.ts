import { Q, Fn, Cond, DuckDBFlavor } from "../index";
import { FunctionExpression } from "../Expression";

const flavor = new DuckDBFlavor({ timezone: "UTC" });
describe("DuckDBFlavor", () => {
  it("quotes identifiers including embedded double quotes and schema components", () => {
    expect(Q.flavors.duckdb).toBeInstanceOf(DuckDBFlavor);
    expect(flavor.escapeColumn('a"b')).toBe('"a""b"');
    expect(flavor.escapeTable('s.t"x')).toBe('"s"."t""x"');
    expect(flavor.escapeColumn("u.*")).toBe('"u".*');
    expect(flavor.escapeColumn('a"; DROP TABLE x;--')).toBe(
      '"a""; DROP TABLE x;--"'
    );
    expect(
      Q.select().field('a"; DROP TABLE x;--').from("items").toSQL(flavor)
    ).toBe('SELECT "a""; DROP TABLE x;--" FROM "items"');
  });
  it("renders a SELECT with predicates, ordering, limits and one-based parameters", () => {
    const query = Q.select()
      .field("id")
      .field("name")
      .from("users")
      .where(Cond.equal("active", true))
      .where(Cond.like("name", "%A%", { caseInsensitive: true }))
      .orderBy("name")
      .limit(10)
      .offset(5);
    expect(query.toSQL(flavor)).toBe(
      'SELECT "id", "name" FROM "users" WHERE "active" = true AND "name" ILIKE \'%A%\' ORDER BY "name" ASC LIMIT 10 OFFSET 5'
    );
    expect(query.toSQLWithBindings(flavor)).toEqual({
      sql: 'SELECT "id", "name" FROM "users" WHERE "active" = $1 AND "name" ILIKE $2 ORDER BY "name" ASC LIMIT $3 OFFSET $4',
      bindings: [true, "%A%", 10, 5],
    });
    expect(Q.select().from("t").offset(2).toSQL(flavor)).toBe(
      'SELECT * FROM "t" OFFSET 2'
    );
  });
  it("renders literals, NULLs and mutations", () => {
    for (const [value, sql] of [
      [null, "NULL"],
      [true, "true"],
      [false, "false"],
      [0, "0"],
      [-10, "-10"],
      [1.5, "1.5"],
      ["", "''"],
      ["O'Reilly", "'O''Reilly'"],
    ] as const)
      expect(flavor.escapeValue(value)).toBe(sql);
    expect(
      Q.update("users")
        .set({ name: "John's Value" })
        .where(Cond.equal("id", 1))
        .toSQL(flavor)
    ).toBe('UPDATE "users" SET "name" = \'John\'\'s Value\' WHERE "id" = 1');
    expect(Cond.isNull("c").toSQL(flavor)).toBe('"c" IS NULL');
    const date = new Date("2025-01-01T00:00:00Z");
    expect(Q.select().field(Q.value(date)).toSQL(flavor)).toBe(
      "SELECT TIMESTAMP '2025-01-01 00:00:00' "
    );
    expect(Q.select().field(Q.value(date)).toSQLWithBindings(flavor)).toEqual({
      sql: "SELECT CAST($1 AS TIMESTAMP) ",
      bindings: ["2025-01-01 00:00:00"],
    });
    expect(Fn.ifnull(Q.value(date), Q.value(date)).toSQL(flavor)).toContain(
      "TIMESTAMP '2025-01-01 00:00:00'"
    );
  });
  it("renders LIKE, NOT LIKE, ILIKE and NOT ILIKE", () => {
    for (const isLike of [false, true])
      for (const ci of [false, true])
        expect(flavor.escapeLikeCondition('"c"', "'x'", isLike, ci)).toBe(
          `"c" ${isLike ? "" : "NOT "}${ci ? "ILIKE" : "LIKE"} 'x'`
        );
  });
  it("renders standard, date, conditional and nested functions", () => {
    for (const fn of [
      Fn.count("id"),
      Fn.sum("amount"),
      Fn.max("amount"),
      Fn.min("amount"),
      Fn.concat("a", Q.value("x")),
    ])
      expect(fn.toSQL(flavor)).toMatch(/^(COUNT|SUM|MAX|MIN|CONCAT)\(/);
    expect(Fn.count("*").toSQL(flavor)).toBe("COUNT(*)");
    expect(Fn.year("created").toSQL(flavor)).toBe(
      'EXTRACT(YEAR FROM "created")'
    );
    expect(Fn.month("created").toSQL(flavor)).toBe(
      'EXTRACT(MONTH FROM "created")'
    );
    expect(
      Fn.sum(Fn.if(Cond.equal("active", true), "amount", Q.value(0))).toSQL(
        flavor
      )
    ).toBe('SUM(CASE WHEN "active" = true THEN "amount" ELSE 0 END)');
    expect(
      Fn.ifnull(
        Fn.concat("first", Q.value(" "), "last"),
        Q.value("unknown")
      ).toSQL(flavor)
    ).toBe("COALESCE(CONCAT(\"first\",' ',\"last\"),'unknown')");
    expect(Fn.add(Q.value(1), Q.value(2)).toSQLWithBindings(flavor)).toEqual({
      sql: "($1 + $2)",
      bindings: [1, 2],
    });
    for (const name of [
      "year",
      "YeAr",
      "MONTH",
      "mOnTh",
      "if",
      "iF",
      "ifnull",
      "dateadd",
    ]) {
      const args =
        name.toLowerCase() === "dateadd"
          ? ["created", Q.value(1), Q.value("day")]
          : name.toLowerCase() === "if"
          ? [Cond.equal("active", true), Q.value(1), Q.value(0)]
          : ["created"];
      expect(new FunctionExpression(name, ...args).toSQL(flavor)).toBe(
        new FunctionExpression(name.toUpperCase(), ...args).toSQL(flavor)
      );
    }
    expect(new FunctionExpression("myFunc", "c").toSQL(flavor)).toBe(
      'myFunc("c")'
    );
  });
  it("renders DATEADD with validated units and binds a single interval", () => {
    for (const unit of [
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
      "week",
    ] as const)
      expect(
        new FunctionExpression(
          "DATEADD",
          "created",
          Q.value(-2),
          Q.value(unit)
        ).toSQL(flavor)
      ).toBe(`("created" + INTERVAL '-2 ${unit}')`);
    expect(Fn.dateAdd("created", 2, "day").toSQLWithBindings(flavor)).toEqual({
      sql: '("created" + CAST($1 AS INTERVAL))',
      bindings: ["2 day"],
    });
    expect(() =>
      Fn.dateAdd("created", 1, "day'); DROP TABLE x;--" as any).toSQL(flavor)
    ).toThrow("Invalid DATEADD interval type");
    for (const value of ["1; DROP TABLE x", NaN, Infinity, 1.5])
      expect(() =>
        Fn.dateAdd("created", value as any, "day").toSQL(flavor)
      ).toThrow("Invalid DATEADD interval");
  });
});
