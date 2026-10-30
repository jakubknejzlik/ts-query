import {
  Q,
  Cond,
  Fn,
  toSQLWithBindings,
  SQLWithBindings,
  ISQLFlavor,
} from "./index";
import { inlineBindings, getBindingComparisons } from "./test-bindings";

describe("Parameterized SQL", () => {
  it.each([
    "./index",
    "./Query",
    "./Mutation",
    "./Expression",
    "./Condition",
    "./bindings",
  ])("supports a fresh %s entry-point import", (entry) => {
    jest.isolateModules(() => {
      require(entry);
      const { Q } = require("./Query");
      const { toSQLWithBindings } = require("./bindings");
      expect(toSQLWithBindings(Q.select().field(Q.value(1)))).toEqual({
        sql: "SELECT ? ",
        bindings: [1],
      });
    });
  });
  it.each(["sqlite", "mysql", "postgres"] as const)(
    "binds conditions, IN, function arguments, LIMIT/OFFSET for %s",
    (name) => {
      const flavor = Q.flavors[name];
      const query = Q.select()
        .from("users", "u")
        .addField(Fn.concat("u.name", Q.value("? ' $1")))
        .where(Cond.equal("u.active", true))
        .where(Cond.in("u.id", [1, 2]))
        .where(Cond.between("u.age", [18, 65]))
        .where(Cond.like("u.name", "%?%"))
        .limit(10)
        .offset(0);
      const result: SQLWithBindings = query.toSQLWithBindings(flavor);
      expect(result.bindings).toEqual([
        "? ' $1",
        true,
        1,
        2,
        18,
        65,
        "%?%",
        10,
        0,
      ]);
      expect(result.sql).not.toContain("%?%");
      expect(result.sql).toContain(name === "postgres" ? "$1" : "?");
      expect(inlineBindings(result, flavor)).toEqual(query.toSQL(flavor));
    }
  );

  it.each(["sqlite", "mysql", "postgres"] as const)(
    "binds mutations and INSERT SELECT for %s",
    (name) => {
      const flavor = Q.flavors[name];
      const date = new Date("2025-01-02T03:04:05Z");
      const insert = Q.insert("users").values([
        { id: 1, name: "a'b", created: date, deleted: null },
        { id: 2, name: "?", created: date, deleted: null },
      ]);
      expect(insert.toSQLWithBindings(flavor).bindings).toEqual([
        1,
        "a'b",
        date,
        null,
        2,
        "?",
        date,
        null,
      ]);
      const update = Q.update("users")
        .set({
          name: "a'b",
          age: 42,
          deleted: Q.value(null),
          count: Q.select()
            .field(Fn.count("id"))
            .from("orders")
            .where(Cond.equal("owner", 7)),
        })
        .where(Cond.equal("id", 1));
      expect(update.toSQLWithBindings(flavor).bindings).toEqual([
        "a'b",
        42,
        null,
        7,
        1,
      ]);
      const select = Q.insert("archive").select(
        Q.select().from("users").where(Cond.equal("id", 3)),
        ["id"]
      );
      expect(select.toSQLWithBindings(flavor).bindings).toEqual([3]);
      expect(
        Q.delete("users").where(Cond.equal("id", 2)).toSQLWithBindings(flavor)
          .bindings
      ).toEqual([2]);
      for (const query of [insert, update, select])
        expect(inlineBindings(query.toSQLWithBindings(flavor), flavor)).toBe(
          query.toSQL(flavor)
        );
    }
  );

  it("orders bindings across nested tables, joins, subqueries and unions", () => {
    const query = Q.select()
      .field(Q.value("first"))
      .from(Q.select().from("a").where(Cond.equal("id", 1)))
      .join(Q.table("b"), Cond.equal("b.id", 2))
      .where(Cond.in("id", Q.select().from("c").where(Cond.equal("id", 3))))
      .union(Q.select().from("d").where(Cond.equal("id", 4)));
    const result = query.toSQLWithBindings(Q.flavors.postgres);
    expect(result.bindings).toEqual(["first", 1, 2, 3, 4]);
    expect(result.sql.match(/\$\d+/g)).toEqual(["$1", "$2", "$3", "$4", "$5"]);
  });

  it.each(["sqlite", "mysql", "postgres", "awsTimestream"] as const)(
    "binds DATEADD with valid %s syntax and no unused arguments",
    (name) => {
      const flavor = Q.flavors[name];
      const query = Q.select().field(
        Fn.dateAdd(Q.value("2025-01-01"), -2, "day")
      );
      const result = query.toSQLWithBindings(flavor);
      expect(inlineBindings(result, flavor)).toBe(query.toSQL(flavor));
      expect(result.bindings).toEqual(
        name === "sqlite" || name === "postgres"
          ? ["2025-01-01", "-2 day"]
          : name === "mysql"
          ? ["2025-01-01", -2]
          : ["day", -2, "2025-01-01"]
      );
    }
  );

  it("shares bindings with render-time table and query transforms", () => {
    const query = Q.select().from("users").where(Cond.equal("id", 5));
    const result = query.toSQLWithBindings(Q.flavors.sqlite, {
      transformTable: (table) =>
        Q.select().from(table).where(Cond.equal("tenant", "t1")),
      transformSelectQuery: (query) => query.where(Cond.equal("enabled", 1)),
    });
    expect(result.bindings).toEqual(["t1", 1, 5, 1]);
    expect(result.sql).toContain(
      "FROM (SELECT * FROM `users` WHERE `tenant` = ? AND `enabled` = ?)"
    );
  });

  it("binds transformed mutations", () => {
    const result = Q.update("users")
      .set({ age: 1 })
      .toSQLWithBindings(Q.flavors.sqlite, {
        transformUpdateMutation: (query) =>
          query.set({ age: 2 }).where(Cond.equal("tenant", "t1")),
      });
    expect(result.bindings).toEqual([2, "t1"]);
  });

  it("does not mutate flavors or reuse bindings between renders", () => {
    const flavor = Q.flavors.postgres;
    const query = Q.select().where(Cond.equal("id", 1));
    expect(query.toSQLWithBindings(flavor)).toEqual(
      query.toSQLWithBindings(flavor)
    );
    expect(flavor.bindValue).toBeUndefined();
    expect(query.toSQL(flavor)).toContain('"id" = 1');
  });

  it("supports a custom flavor placeholder and LIMIT/OFFSET ordering", () => {
    const flavor: ISQLFlavor = Object.create(Q.flavors.sqlite);
    flavor.parameterPlaceholder = (index) => `:p${index}`;
    expect(Q.select().limit(3).offset(2).toSQLWithBindings(flavor)).toEqual({
      sql: "SELECT *  LIMIT :p1 OFFSET :p2",
      bindings: [3, 2],
    });
  });

  it("keeps raw SQL explicit and binds actual null literals", () => {
    expect(
      Q.select()
        .field(Q.raw("CURRENT_TIMESTAMP"))
        .field(Q.value(null))
        .toSQLWithBindings(Q.flavors.sqlite)
    ).toEqual({ sql: "SELECT CURRENT_TIMESTAMP, ? ", bindings: [null] });
  });

  it("binds legacy NULL literal nodes in mutation, IN and VALUES builders", () => {
    const flavor = Q.flavors.sqlite;
    expect(
      Q.update("users").set({ deleted: null }).toSQLWithBindings(flavor)
    ).toEqual({ sql: "UPDATE `users` SET `deleted` = ?", bindings: [null] });
    expect(
      Q.select().where(Cond.in("id", [])).toSQLWithBindings(flavor).bindings
    ).toEqual([null]);
    expect(Q.values([{ id: null }]).toSQLWithBindings(flavor).bindings).toEqual(
      [null]
    );
  });
  it("renders correctly when a token nonce has no fractional digits", () => {
    const random = jest.spyOn(Math, "random").mockReturnValue(0);
    try {
      expect(
        Q.select().field(Q.value("value")).toSQLWithBindings(Q.flavors.sqlite)
      ).toEqual({ sql: "SELECT ? ", bindings: ["value"] });
    } finally {
      random.mockRestore();
    }
  });

  it("supports the standalone API and empty bindings", () => {
    expect(toSQLWithBindings(Q.select().from("users"))).toEqual({
      sql: "SELECT * FROM `users`",
      bindings: [],
    });
  });

  it("reconstructs inline SQL for every successful rendering in the existing test corpus", () => {
    // The Jest setup installs the same inlineBindings assertion around all SQL
    // renderers, so each existing test exercises this invariant on its own AST.
    Q.select().from("corpus").where(Cond.equal("id", 1)).toSQL();
    expect(getBindingComparisons()).toBeGreaterThan(0);
  });
});
