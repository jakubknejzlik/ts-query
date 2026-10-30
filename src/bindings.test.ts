import {
  Q,
  Cond,
  Fn,
  toSQLWithBindings,
  SQLWithBindings,
  ISQLFlavor,
  DefaultFlavor,
  MySQLFlavor,
  PostgresFlavor,
  SQLiteFlavor,
  AWSTimestreamFlavor,
} from "./index";
import { inlineBindings, getBindingComparisons } from "./test-bindings";
import { getGeneratedBindingCasts } from "./bindings";

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
      const formattedDate = flavor.formatDateValue(date);
      const insert = Q.insert("users").values([
        { id: 1, name: "a'b", created: date, deleted: null },
        { id: 2, name: "?", created: date, deleted: null },
      ]);
      expect(insert.toSQLWithBindings(flavor).bindings).toEqual([
        1,
        "a'b",
        formattedDate,
        null,
        2,
        "?",
        formattedDate,
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

  it.each([
    ["default", DefaultFlavor],
    ["mysql", MySQLFlavor],
    ["postgres", PostgresFlavor],
    ["sqlite", SQLiteFlavor],
    ["awsTimestream", AWSTimestreamFlavor],
  ] as const)(
    "types only PostgreSQL fractional LIMIT/OFFSET for %s",
    (name, Flavor) => {
      const flavor = new Flavor();
      for (const [limit, offset] of [
        [1.5, 0.5],
        [2, 1],
        [1.5, 1],
        [2, 0.5],
      ]) {
        const query = Q.select()
          .field("id")
          .from("t")
          .limit(limit)
          .offset(offset);
        const result = query.toSQLWithBindings(flavor);
        const quote =
          name === "postgres" || name === "awsTimestream" ? '"' : "`";
        const pagination =
          name === "postgres"
            ? `LIMIT $1${Number.isInteger(limit) ? "" : "::numeric"} OFFSET $2${
                Number.isInteger(offset) ? "" : "::numeric"
              }`
            : name === "awsTimestream"
            ? "OFFSET ? LIMIT ?"
            : "LIMIT ? OFFSET ?";
        expect(result).toEqual({
          sql: `SELECT ${quote}id${quote} FROM ${quote}t${quote} ${pagination}`,
          bindings:
            name === "awsTimestream" ? [offset, limit] : [limit, offset],
        });
        const casts = getGeneratedBindingCasts(result);
        expect(casts.map(({ sql }) => sql)).toEqual(
          name === "postgres"
            ? [
                !Number.isInteger(limit) && "$1::numeric",
                !Number.isInteger(offset) && "$2::numeric",
              ].filter(Boolean)
            : []
        );
        for (const cast of casts) {
          expect(
            result.sql.slice(cast.start, cast.start + cast.sql.length)
          ).toBe(cast.sql);
        }
        expect(inlineBindings(result, flavor)).toBe(query.toSQL(flavor));
      }
    }
  );

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

  describe.each(["postgres", "mysql"] as const)(
    "%s bound numbers",
    (dialect) => {
      it.each([
        { value: 10.5, cast: "::numeric" },
        { value: -0.5, cast: "::numeric" },
        { value: 1e-3, cast: "::numeric" },
        { value: 2, cast: "" },
      ])(
        "renders $value in WHERE, BETWEEN, IN, SET and VALUES",
        ({ value, cast }) => {
          const flavor = Q.flavors[dialect];
          const column = dialect === "postgres" ? '"amount"' : "`amount`";
          const table = dialect === "postgres" ? '"t"' : "`t`";
          const first = dialect === "postgres" ? `$1${cast}` : "?";
          const second = dialect === "postgres" ? `$2${cast}` : "?";
          const integer = dialect === "postgres" ? "$2" : "?";
          const cases = [
            {
              query: Q.select()
                .from("t")
                .where(Cond.greaterThan("amount", value)),
              sql: `SELECT * FROM ${table} WHERE ${column} > ${first}`,
              bindings: [value],
            },
            {
              query: Q.select()
                .from("t")
                .where(Cond.between("amount", [value, value])),
              sql: `SELECT * FROM ${table} WHERE ${column} BETWEEN ${first} AND ${second}`,
              bindings: [value, value],
            },
            {
              query: Q.select()
                .from("t")
                .where(Cond.in("amount", [value, 2])),
              sql: `SELECT * FROM ${table} WHERE ${column} IN (${first}, ${integer})`,
              bindings: [value, 2],
            },
            {
              query: Q.update("t").set({ amount: value }),
              sql: `UPDATE ${table} SET ${column} = ${first}`,
              bindings: [value],
            },
            {
              query: Q.insert("t").values([{ amount: value }]),
              sql: `INSERT INTO ${table} (${column}) VALUES (${first})`,
              bindings: [value],
            },
          ];
          for (const { query, sql, bindings } of cases) {
            const result = query.toSQLWithBindings(flavor);
            expect(result).toEqual({ sql, bindings });
            expect(inlineBindings(result, flavor)).toBe(query.toSQL(flavor));
          }
        }
      );
    }
  );

  it("records exact numeric cast locations without duplicating typed literal casts", () => {
    const flavor = Q.flavors.postgres;
    const query = Q.select()
      .field(Q.raw("42::numeric"))
      .field(Q.value(1.5))
      .field(Fn.multiply(Q.value(2.5), Q.value(3)))
      .where(Cond.in("amount", [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]));
    const result = query.toSQLWithBindings(flavor);
    const casts = getGeneratedBindingCasts(result);
    expect(casts.map(({ sql }) => sql)).toEqual([
      "$1::numeric",
      "$2::numeric",
      "$3::integer",
      "$4::numeric",
      "$5::numeric",
      "$6::numeric",
      "$7::numeric",
      "$8::numeric",
      "$9::numeric",
      "$10::numeric",
      "$11::numeric",
    ]);
    for (const cast of casts) {
      expect(result.sql.slice(cast.start, cast.start + cast.sql.length)).toBe(
        cast.sql
      );
      expect(cast.sql).toContain(cast.placeholder);
    }
    expect(result.sql).not.toContain("::numeric::numeric");
    expect(inlineBindings(result, flavor)).toBe(query.toSQL(flavor));
    expect(inlineBindings(result, flavor)).toContain("42::numeric");
  });

  describe.each([
    ["default", DefaultFlavor],
    ["mysql", MySQLFlavor],
    ["postgres", PostgresFlavor],
    ["sqlite", SQLiteFlavor],
    ["awsTimestream", AWSTimestreamFlavor],
  ] as const)("%s bound Dates", (_name, Flavor) => {
    it.each([
      ["2024-01-01T23:30:00Z", "2024-01-02 00:30:00"],
      ["2024-07-01T23:30:00Z", "2024-07-02 01:30:00"],
    ])("formats %s using the flavor timezone", (instant, formatted) => {
      const flavor = new Flavor({ timezone: "Europe/Prague" });
      const date = new Date(instant);
      const queries = [
        Q.select().where(Cond.equal("created_at", date)),
        Q.select().field(Q.value(date)),
        Q.select().field(Fn.concat(Q.value(date))),
        Q.update("t").set({ created_at: date }),
        Q.insert("t").values([{ created_at: date }]),
      ];
      for (const query of queries) {
        const result = query.toSQLWithBindings(flavor);
        expect(result.bindings).toEqual([formatted]);
        expect(inlineBindings(result, flavor)).toBe(query.toSQL(flavor));
      }
      if (flavor instanceof PostgresFlavor) {
        expect(queries[0].toSQLWithBindings(flavor).sql).toBe(
          'SELECT *  WHERE "created_at" = $1'
        );
        expect(queries[1].toSQLWithBindings(flavor).sql).toBe(
          "SELECT CAST($1 AS TEXT) "
        );
        expect(queries[2].toSQLWithBindings(flavor).sql).toBe(
          "SELECT CONCAT(CAST($1 AS TEXT)) "
        );
      }
    });
  });

  it("preserves Timestream Date typing in public SQL beside an identical string binding", () => {
    const flavor = new AWSTimestreamFlavor({ timezone: "Europe/Prague" });
    const query = Q.select()
      .field(Q.value(new Date("2024-01-01T23:30:00Z")))
      .field(Q.value("2024-01-02 00:30:00"));
    const result = query.toSQLWithBindings(flavor);
    expect(result.bindings).toEqual([
      "2024-01-02 00:30:00",
      "2024-01-02 00:30:00",
    ]);
    expect(result.sql).toBe("SELECT CAST(? AS TIMESTAMP), ? ");
    expect(getGeneratedBindingCasts(result)).toEqual([
      { start: 7, sql: "CAST(? AS TIMESTAMP)", placeholder: "?" },
    ]);
    expect(inlineBindings(result, flavor)).toBe(
      "SELECT TIMESTAMP '2024-01-02 00:30:00', '2024-01-02 00:30:00' "
    );
    // Public SQL retains its timestamp type; unregistered casts stay verbatim
    // when the parity harness substitutes their placeholders.
    const publicResult = { sql: result.sql, bindings: [...result.bindings] };
    expect(inlineBindings(publicResult, flavor)).toBe(
      "SELECT CAST('2024-01-02 00:30:00' AS TIMESTAMP), '2024-01-02 00:30:00' "
    );
    publicResult.sql = "SELECT ?, ? ";
    expect(inlineBindings(publicResult, flavor)).not.toBe(query.toSQL(flavor));
    result.bindings[0] = "2024-01-01 23:30:00";
    expect(inlineBindings(result, flavor)).toBe(
      "SELECT TIMESTAMP '2024-01-01 23:30:00', '2024-01-02 00:30:00' "
    );
    expect(inlineBindings(result, flavor)).not.toBe(query.toSQL(flavor));
  });

  describe.each([
    ["TIMESTAMP", "2024-01-02 00:30:00"],
    ["INTERVAL", "1 day"],
  ])("%s cast parity", (type, value) => {
    const cast = `CAST('${value}' AS ${type})`;

    it("preserves authored PostgreSQL literal casts without bindings", () => {
      const flavor = Q.flavors.postgres;
      const query = Q.select().field(Q.raw(cast));
      const result = query.toSQLWithBindings(flavor);
      expect(result).toEqual({ sql: `SELECT ${cast} `, bindings: [] });
      expect(inlineBindings(result, flavor)).toBe(query.toSQL(flavor));
    });

    it("rejects an authored cast with a stray extra binding in the real harness", () => {
      const flavor = Q.flavors.postgres;
      const query = Q.select().field(Q.raw(cast));
      const result = query.toSQLWithBindings(flavor);
      result.bindings.push("WRONG ACTUAL BINDING");
      const render = jest
        .spyOn(require("./bindings"), "toSQLWithBindings")
        .mockReturnValue(result);
      try {
        expect(() => query.toSQL(flavor)).toThrow("Unused SQL bindings");
      } finally {
        render.mockRestore();
      }
    });

    it("preserves quoted cast data", () => {
      const flavor = Q.flavors.mysql;
      const quoted = Q.select().field(Q.value(cast));
      expect(inlineBindings(quoted.toSQLWithBindings(flavor), flavor)).toBe(
        quoted.toSQL(flavor)
      );
    });

    it("rejects a corrupted MySQL string binding in the real harness", () => {
      const flavor = Q.flavors.mysql;
      const literal = `${type} '${value}'`;
      const expression = Q.value(literal);
      const original = expression.toSQL;
      expression.toSQL = function (flavor, options) {
        return flavor.bindValue
          ? flavor.escapeValue(cast)
          : original.call(this, flavor, options);
      };
      const query = Q.select().field(expression);
      const result = query.toSQLWithBindings(flavor);
      expect(result).toEqual({ sql: "SELECT ? ", bindings: [cast] });
      expect(inlineBindings(result, flavor)).toBe(
        `SELECT ${flavor.escapeValue(cast)} `
      );
      expect(inlineBindings(result, flavor)).not.toBe(
        `SELECT ${flavor.escapeValue(literal)} `
      );
      expect(() => query.toSQL(flavor)).toThrow();
    });
  });

  it.each(["?", "$n"])(
    "normalises only registered Timestream Date casts around %s placeholders",
    (placeholder) => {
      const flavor: ISQLFlavor = new AWSTimestreamFlavor({
        timezone: "Europe/Prague",
      });
      if (placeholder === "$n")
        flavor.parameterPlaceholder = (index) => `$${index}`;
      const cast = "CAST('2024-01-02 00:30:00' AS TIMESTAMP)";
      const query = Q.select()
        .field(Q.raw(cast))
        .field(Q.value(new Date("2024-01-01T23:30:00Z")))
        .field(Q.value(cast));
      const result = query.toSQLWithBindings(flavor);
      const token = placeholder === "$n" ? "$1" : "?";
      expect(result.sql).toBe(
        `SELECT ${cast}, CAST(${token} AS TIMESTAMP), ${
          placeholder === "$n" ? "$2" : "?"
        } `
      );
      expect(inlineBindings(result, flavor)).toBe(query.toSQL(flavor));
      expect(query.toSQL(flavor)).toBe(
        `SELECT ${cast}, TIMESTAMP '2024-01-02 00:30:00', ${flavor.escapeValue(
          cast
        )} `
      );
    }
  );

  it("normalises a generated DATEADD interval beside authored interval casts", () => {
    const flavor = Q.flavors.postgres;
    const cast = "CAST('1 day' AS INTERVAL)";
    const query = Q.select()
      .field(Q.raw(cast))
      .field(Fn.dateAdd("created_at", 1, "day"))
      .field(Q.value(cast));
    const result = query.toSQLWithBindings(flavor);
    expect(result).toEqual({
      sql: `SELECT ${cast}, ("created_at" + CAST($1 AS INTERVAL)), CAST($2 AS TEXT) `,
      bindings: ["1 day", cast],
    });
    expect(getGeneratedBindingCasts(result).map(({ sql }) => sql)).toEqual([
      "CAST($1 AS INTERVAL)",
      "CAST($2 AS TEXT)",
    ]);
    expect(inlineBindings(result, flavor)).toBe(query.toSQL(flavor));
  });

  it.each([
    ["default", DefaultFlavor],
    ["mysql", MySQLFlavor],
    ["postgres", PostgresFlavor],
    ["sqlite", SQLiteFlavor],
    ["awsTimestream", AWSTimestreamFlavor],
  ] as const)(
    "rejects a raw Date replacing a formatted %s binding in parity checks",
    (_name, Flavor) => {
      const flavor = new Flavor({ timezone: "Europe/Prague" });
      const date = new Date("2024-01-01T23:30:00Z");
      const query = Q.select().field(Q.value(date));
      const result = query.toSQLWithBindings(flavor);
      expect(result.bindings).toEqual(["2024-01-02 00:30:00"]);
      expect(inlineBindings(result, flavor)).toBe(query.toSQL(flavor));
      // A driver can serialize a raw Date differently; escaping it here would
      // format it again and hide a regression in the public binding value.
      result.bindings[0] = date;
      expect(() => inlineBindings(result, flavor)).toThrow(
        "Date bindings must be formatted strings"
      );
    }
  );

  it("reconstructs inline SQL for every successful rendering in the existing test corpus", () => {
    // The Jest setup installs the same inlineBindings assertion around all SQL
    // renderers, so each existing test exercises this invariant on its own AST.
    Q.select().from("corpus").where(Cond.equal("id", 1)).toSQL();
    expect(getBindingComparisons()).toBeGreaterThan(0);
  });
});
