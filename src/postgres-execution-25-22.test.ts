import type { PGlite } from "@electric-sql/pglite";
import { Cond, Fn, PostgresFlavor, Q } from "./index";
import type {
  InsertMutation,
  ISQLFlavor,
  SelectQuery,
  UpdateMutation,
} from "./index";

const supportsPGlite = Number(process.versions.node.split(".")[0]) >= 18;
if (!supportsPGlite) {
  console.info("Skipping PostgreSQL execution tests on Node.js <18.");
}
const describePostgres = supportsPGlite ? describe : describe.skip;

describePostgres("PostgreSQL inline and bound execution (#25, #22)", () => {
  let db: PGlite;
  const pg = Q.flavors.postgres;
  const firstId = "00000000-0000-4000-8000-000000000001";
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const allRows = [{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }];
  const lastTwo = [{ ordinal: 2 }, { ordinal: 3 }];

  beforeAll(async () => {
    // Keep the runtime import in this hook so Node 16 can skip loading PGlite.
    const { PGlite } = require("@electric-sql/pglite");
    db = new PGlite();
    await db.waitReady;
    await db.exec(`
      CREATE TABLE t (
        ordinal integer PRIMARY KEY,
        id uuid,
        label text,
        price integer,
        big_price bigint,
        amount numeric,
        ratio double precision,
        team text,
        created_at timestamptz,
        ts_col timestamp
      );
      CREATE TABLE t2 (amount numeric, ratio double precision, ts_col timestamp);
      CREATE TABLE teams (team text PRIMARY KEY);
    `);
  }, 30000);

  beforeEach(async () => {
    await db.query("SELECT set_config('TimeZone', $1, false)", [localZone]);
    await db.exec(`
      TRUNCATE t, t2, teams;
      INSERT INTO teams VALUES ('alpha'), ('beta');
      INSERT INTO t VALUES
        (1, '${firstId}', 'first', 10, 10, 10.50, 10.50, 'alpha',
         '2024-01-01T23:30:00Z', '2024-01-02 00:00:00'),
        (2, '00000000-0000-4000-8000-000000000002', 'second',
         20, 20, 20.00, 20.00, 'alpha',
         '2024-01-02T00:00:00Z', '2024-01-02 00:30:00'),
        (3, '00000000-0000-4000-8000-000000000003', 'third',
         30, 30, 30.75, 30.75, 'beta',
         '2024-01-02T00:30:00Z', '2024-01-02 01:00:00');
    `);
  });

  afterAll(async () => {
    await db?.close();
  });

  async function execute(sql: string, bindings?: unknown[]) {
    try {
      return await db.query(sql, bindings);
    } catch (error) {
      // Include SQLSTATE in Jest's failure output, rather than losing it in a stack.
      throw new Error(`PostgreSQL ${error.code}: ${error.message}`);
    }
  }

  async function expectEquivalent(
    query: SelectQuery,
    expectedRows: unknown[],
    flavor: ISQLFlavor = pg,
    untyped = false
  ) {
    const inline = await execute(query.toSQL(flavor));
    expect(inline.rows).toEqual(expectedRows);
    const { sql, bindings } = query.toSQLWithBindings(flavor);
    if (untyped) expect(sql).not.toMatch(/::|CAST\(/i);
    const bound = await execute(sql, bindings);
    expect(bound.rows).toEqual(inline.rows);
    expect(bound.rows).toEqual(expectedRows);
  }

  async function expectMutationEquivalent(
    query: InsertMutation | UpdateMutation,
    readback: SelectQuery,
    expectedRows: unknown[],
    affectedRows: number,
    flavor: ISQLFlavor = pg,
    untyped = false
  ) {
    const inlineSql = query.toSQL(flavor);
    const { sql, bindings } = query.toSQLWithBindings(flavor);
    if (untyped) expect(sql).not.toMatch(/::|CAST\(/i);
    const run = async (statement: string, values?: unknown[]) => {
      // Both mutations start from the same fixture, including INSERT VALUES.
      await db.exec("BEGIN");
      try {
        const result = await execute(statement, values);
        const { rows } = await execute(readback.toSQL(flavor));
        return { rows, affectedRows: result.affectedRows };
      } finally {
        await db.exec("ROLLBACK");
      }
    };
    const inline = await run(inlineSql);
    expect(inline.rows).toEqual(expectedRows);
    expect(inline.affectedRows).toBe(affectedRows);
    const bound = await run(sql, bindings);
    expect(bound.rows).toEqual(inline.rows);
    expect(bound.rows).toEqual(expectedRows);
    expect(bound.affectedRows).toBe(inline.affectedRows);
  }

  const ordinals = () =>
    Q.select().from("t").field("ordinal").orderBy("ordinal");

  it("rounds fractional LIMIT 1.5 and OFFSET 0.5 identically inline and bound", async () => {
    await expectEquivalent(ordinals().limit(1.5).offset(0.5), lastTwo);
  });

  const grouped = (column: string, threshold: number) =>
    Q.select()
      .from("t")
      .field("team")
      .groupBy("team")
      .having(Cond.greaterThan(Fn.sum(column), threshold))
      .orderBy("team");

  const joined = (column: string, threshold: number) =>
    Q.select()
      .from("t")
      .innerJoin(
        Q.table("teams"),
        Cond.and([
          Cond.columnEqual("t.team", "teams.team"),
          Cond.greaterThan(`t.${column}`, threshold),
        ])
      )
      .field("t.ordinal", "ordinal")
      .orderBy("t.ordinal");

  const numberReadback = (column: string) =>
    // Normalize integer/bigint and numeric/double output without driver decoding.
    Q.select()
      .from("t")
      .field("ordinal")
      .field(Q.raw(`"${column}"::text`), "value")
      .orderBy("ordinal");

  describe("#25: non-integer comparisons with integer columns", () => {
    // Ordinary success assertions deliberately leave CI red until the fix lands.
    it("compares integer > 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThan("price", 10.5)),
        lastTwo
      );
    });

    it("compares integer < 10.5", async () => {
      await expectEquivalent(ordinals().where(Cond.lessThan("price", 10.5)), [
        { ordinal: 1 },
      ]);
    });

    it("compares integer >= 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThanOrEqual("price", 10.5)),
        lastTwo
      );
    });

    it("compares integer <= 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.lessThanOrEqual("price", 10.5)),
        [{ ordinal: 1 }]
      );
    });

    it("compares integer = 10.5", async () => {
      await expectEquivalent(ordinals().where(Cond.equal("price", 10.5)), []);
    });

    it("compares integer != 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.notEqual("price", 10.5)),
        allRows
      );
    });

    it("compares bigint > 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThan("big_price", 10.5)),
        lastTwo
      );
    });

    it("compares bigint < 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.lessThan("big_price", 10.5)),
        [{ ordinal: 1 }]
      );
    });

    it("compares bigint >= 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThanOrEqual("big_price", 10.5)),
        lastTwo
      );
    });

    it("compares bigint <= 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.lessThanOrEqual("big_price", 10.5)),
        [{ ordinal: 1 }]
      );
    });

    it("compares bigint = 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.equal("big_price", 10.5)),
        []
      );
    });

    it("compares bigint != 10.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.notEqual("big_price", 10.5)),
        allRows
      );
    });

    it("compares integer BETWEEN 1.5 AND 25.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.between("price", [1.5, 25.5])),
        [{ ordinal: 1 }, { ordinal: 2 }]
      );
    });

    it("compares bigint BETWEEN 1.5 AND 25.5", async () => {
      await expectEquivalent(
        ordinals().where(Cond.between("big_price", [1.5, 25.5])),
        [{ ordinal: 1 }, { ordinal: 2 }]
      );
    });

    it("compares integer IN a mixed float/integer list", async () => {
      await expectEquivalent(ordinals().where(Cond.in("price", [10.5, 20])), [
        { ordinal: 2 },
      ]);
    });

    it("compares bigint IN a mixed float/integer list", async () => {
      await expectEquivalent(
        ordinals().where(Cond.in("big_price", [10.5, 20])),
        [{ ordinal: 2 }]
      );
    });

    it("updates integer rows WHERE price > 10.5", async () => {
      await expectMutationEquivalent(
        Q.update("t").set({ price: 99 }).where(Cond.greaterThan("price", 10.5)),
        numberReadback("price"),
        [
          { ordinal: 1, value: "10" },
          { ordinal: 2, value: "99" },
          { ordinal: 3, value: "99" },
        ],
        2
      );
    });

    it("updates bigint rows WHERE big_price > 10.5", async () => {
      await expectMutationEquivalent(
        Q.update("t")
          .set({ big_price: 99 })
          .where(Cond.greaterThan("big_price", 10.5)),
        numberReadback("big_price"),
        [
          { ordinal: 1, value: "10" },
          { ordinal: 2, value: "99" },
          { ordinal: 3, value: "99" },
        ],
        2
      );
    });

    it("filters groups HAVING SUM(integer) > 10.5", async () => {
      await expectEquivalent(grouped("price", 10.5), [
        { team: "alpha" },
        { team: "beta" },
      ]);
    });

    it("filters groups HAVING SUM(bigint) > 10.5", async () => {
      // SUM(bigint) returns numeric, so this position already has enough context.
      await expectEquivalent(grouped("big_price", 10.5), [
        { team: "alpha" },
        { team: "beta" },
      ]);
    });

    it("joins with an integer > 10.5 condition", async () => {
      await expectEquivalent(joined("price", 10.5), lastTwo);
    });

    it("joins with a bigint > 10.5 condition", async () => {
      await expectEquivalent(joined("big_price", 10.5), lastTwo);
    });

    it("compares integer > a negative float (-0.5)", async () => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThan("price", -0.5)),
        allRows
      );
    });

    it("compares integer > an exponent-style float (1e-3)", async () => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThan("price", 1e-3)),
        allRows
      );
    });

    it("returns an empty set for integer > 1000.5 without an error", async () => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThan("price", 1000.5)),
        []
      );
    });

    it("returns an empty set for bigint > 1000.5 without an error", async () => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThan("big_price", 1000.5)),
        []
      );
    });

    it("orders by CASE with a float in its integer condition", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field("ordinal")
          .orderBy(
            Fn.if(Cond.greaterThan("price", 10.5), Q.value(0), Q.value(1))
          )
          .orderBy("ordinal"),
        [{ ordinal: 2 }, { ordinal: 3 }, { ordinal: 1 }]
      );
    });
  });

  async function expectIntegerRegression(column: string) {
    // Check every operator and position explicitly; integers must stay untyped.
    await expectEquivalent(
      ordinals().where(Cond.greaterThan(column, 10)),
      lastTwo,
      pg,
      true
    );
    await expectEquivalent(
      ordinals().where(Cond.lessThan(column, 20)),
      [{ ordinal: 1 }],
      pg,
      true
    );
    await expectEquivalent(
      ordinals().where(Cond.greaterThanOrEqual(column, 20)),
      lastTwo,
      pg,
      true
    );
    await expectEquivalent(
      ordinals().where(Cond.lessThanOrEqual(column, 10)),
      [{ ordinal: 1 }],
      pg,
      true
    );
    await expectEquivalent(
      ordinals().where(Cond.equal(column, 20)),
      [{ ordinal: 2 }],
      pg,
      true
    );
    await expectEquivalent(
      ordinals().where(Cond.notEqual(column, 20)),
      [{ ordinal: 1 }, { ordinal: 3 }],
      pg,
      true
    );
    await expectEquivalent(
      ordinals().where(Cond.between(column, [1, 25])),
      [{ ordinal: 1 }, { ordinal: 2 }],
      pg,
      true
    );
    await expectEquivalent(
      ordinals().where(Cond.in(column, [10, 20])),
      [{ ordinal: 1 }, { ordinal: 2 }],
      pg,
      true
    );
    await expectEquivalent(
      grouped(column, 10),
      [{ team: "alpha" }, { team: "beta" }],
      pg,
      true
    );
    await expectEquivalent(joined(column, 10), lastTwo, pg, true);
    await expectEquivalent(
      ordinals().where(Cond.greaterThan(column, -1)),
      allRows,
      pg,
      true
    );
    await expectEquivalent(
      ordinals().where(Cond.greaterThan(column, 1)),
      allRows,
      pg,
      true
    );
    await expectEquivalent(
      ordinals().where(Cond.greaterThan(column, 1000)),
      [],
      pg,
      true
    );
    const ordered = Q.select()
      .from("t")
      .field("ordinal")
      .orderBy(Fn.if(Cond.greaterThan(column, 10), Q.value(0), Q.value(1)))
      .orderBy("ordinal");
    // CASE's result branches need casts; its integer comparison does not.
    expect(ordered.toSQLWithBindings(pg).sql).toContain(
      `CASE WHEN "${column}" > $1 THEN`
    );
    await expectEquivalent(ordered, [
      { ordinal: 2 },
      { ordinal: 3 },
      { ordinal: 1 },
    ]);
    await expectMutationEquivalent(
      Q.update("t")
        .set({ [column]: 99 })
        .where(Cond.greaterThan(column, 10)),
      numberReadback(column),
      [
        { ordinal: 1, value: "10" },
        { ordinal: 2, value: "99" },
        { ordinal: 3, value: "99" },
      ],
      2,
      pg,
      true
    );
    await expectMutationEquivalent(
      Q.insert("t").values([{ ordinal: 4, [column]: 40 }]),
      numberReadback(column).where(Cond.equal("ordinal", 4)),
      [{ ordinal: 4, value: "40" }],
      1,
      pg,
      true
    );
  }

  async function expectFractionalRegression(column: "amount" | "ratio") {
    await expectEquivalent(
      ordinals().where(Cond.greaterThan(column, 10.5)),
      lastTwo
    );
    await expectEquivalent(
      ordinals().where(Cond.between(column, [1.5, 25.5])),
      [{ ordinal: 1 }, { ordinal: 2 }]
    );
    await expectEquivalent(ordinals().where(Cond.in(column, [10.5, 20])), [
      { ordinal: 1 },
      { ordinal: 2 },
    ]);
    await expectMutationEquivalent(
      Q.update("t")
        .set({ [column]: 42.25 })
        .where(Cond.equal("ordinal", 2)),
      numberReadback(column),
      [
        { ordinal: 1, value: column === "amount" ? "10.50" : "10.5" },
        { ordinal: 2, value: "42.25" },
        { ordinal: 3, value: "30.75" },
      ],
      1
    );
    // A float into numeric/double is valid inline; a float into integer is not.
    await expectMutationEquivalent(
      Q.insert("t2").values([{ [column]: 42.25 }]),
      Q.select()
        .from("t2")
        .field(Q.raw(`"${column}"::text`), "value"),
      [{ value: "42.25" }],
      1
    );
  }

  describe("#25: regression guards", () => {
    it("keeps integer parameters untyped in integer comparisons and mutations", async () => {
      await expectIntegerRegression("price");
    });

    it("keeps integer parameters untyped in bigint comparisons and mutations", async () => {
      await expectIntegerRegression("big_price");
    });

    it("executes numeric floats in >, BETWEEN, IN, UPDATE SET and INSERT VALUES", async () => {
      await expectFractionalRegression("amount");
    });

    it("executes double precision floats in >, BETWEEN, IN, UPDATE SET and INSERT VALUES", async () => {
      await expectFractionalRegression("ratio");
    });

    it("keeps uuid, text and timestamptz strings untyped in a combined condition", async () => {
      await expectEquivalent(
        ordinals().where(
          Cond.and([
            Cond.equal("id", firstId),
            Cond.equal("label", "first"),
            Cond.equal("created_at", "2024-01-01T23:30:00Z"),
          ])
        ),
        [{ ordinal: 1 }],
        pg,
        true
      );
    });
  });

  describe("#22: parity with inline in Europe/Prague", () => {
    const prague = new PostgresFlavor({ timezone: "Europe/Prague" });
    const winter = new Date("2024-01-01T23:30:00Z");
    const summer = new Date("2024-07-01T23:30:00Z");

    beforeEach(async () => {
      await db.query("SELECT set_config('TimeZone', $1, false)", [
        "Europe/Prague",
      ]);
    });

    const timestampReadback = (table: string) =>
      Q.select()
        .from(table)
        .field(Q.raw("to_char(ts_col, 'YYYY-MM-DD HH24:MI:SS')"), "wall_clock");

    async function seedSummerTimestamps() {
      await db.exec(`
        UPDATE t SET ts_col = CASE ordinal
          WHEN 1 THEN timestamp '2024-07-02 01:00:00'
          WHEN 2 THEN timestamp '2024-07-02 01:30:00'
          WHEN 3 THEN timestamp '2024-07-02 02:00:00'
        END;
      `);
    }

    it("compares timestamp > a winter Date using Prague wall-clock", async () => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThan("ts_col", winter)),
        [{ ordinal: 3 }],
        prague
      );
    });

    it("compares timestamp = a winter Date using Prague wall-clock", async () => {
      await expectEquivalent(
        ordinals().where(Cond.equal("ts_col", winter)),
        [{ ordinal: 2 }],
        prague
      );
    });

    it("compares timestamp > a summer Date using Prague DST wall-clock", async () => {
      await seedSummerTimestamps();
      await expectEquivalent(
        ordinals().where(Cond.greaterThan("ts_col", summer)),
        [{ ordinal: 3 }],
        prague
      );
    });

    it("compares timestamp = a summer Date using Prague DST wall-clock", async () => {
      await seedSummerTimestamps();
      await expectEquivalent(
        ordinals().where(Cond.equal("ts_col", summer)),
        [{ ordinal: 2 }],
        prague
      );
    });

    it("matches inline timestamptz semantics when the session is UTC and flavor is Prague", async () => {
      await db.query("SELECT set_config('TimeZone', $1, false)", ["UTC"]);
      // Option 1: Prague's offset-free 00:30 is interpreted as UTC by this session.
      // Parity with inline is the contract, even though it is not the Date's instant.
      await expectEquivalent(
        ordinals().where(Cond.equal("created_at", winter)),
        [{ ordinal: 3 }],
        prague
      );
    });

    it("stores the same timestamp wall-clock for a Date in UPDATE SET", async () => {
      await expectMutationEquivalent(
        Q.update("t").set({ ts_col: winter }).where(Cond.equal("ordinal", 1)),
        timestampReadback("t").where(Cond.equal("ordinal", 1)),
        [{ wall_clock: "2024-01-02 00:30:00" }],
        1,
        prague
      );
    });

    it("stores the same timestamp wall-clock for a summer Date in INSERT VALUES", async () => {
      await expectMutationEquivalent(
        Q.insert("t2").values([{ ts_col: summer }]),
        timestampReadback("t2"),
        [{ wall_clock: "2024-07-02 01:30:00" }],
        1,
        prague
      );
    });
  });

  it("preserves Date comparisons without a timezone option in the process local session zone", async () => {
    // Same setup as the existing execution harness: offset-free inline Dates
    // use the local renderer zone, and timestamptz interprets them in that zone.
    await db.query("SELECT set_config('TimeZone', $1, false)", [localZone]);
    await expectEquivalent(
      ordinals().where(
        Cond.equal("created_at", new Date("2024-01-01T23:30:00Z"))
      ),
      [{ ordinal: 1 }]
    );
  });
});
