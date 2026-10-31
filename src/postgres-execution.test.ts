import { PGlite } from "@electric-sql/pglite";
import { Cond, Fn, Q } from "./index";
import { FunctionExpression } from "./Expression";
import type {
  DeleteMutation,
  InsertMutation,
  SelectQuery,
  UpdateMutation,
} from "./index";

describe("PostgreSQL inline and bound execution (#21)", () => {
  let db: PGlite;
  const pg = Q.flavors.postgres;
  const firstId = "00000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    // Inline Dates have no offset; interpret them in the renderer's local zone.
    await db.query("SELECT set_config('TimeZone', $1, false)", [
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ]);
    await db.exec(`
      CREATE TABLE t (
        id uuid PRIMARY KEY,
        ordinal integer UNIQUE,
        first_name text,
        last_name text,
        parameters jsonb,
        created_at timestamptz,
        amount numeric,
        price integer,
        status text,
        col text,
        active boolean,
        team text
      );
      CREATE TABLE names (name text);
    `);
  }, 30000);

  beforeEach(async () => {
    await db.exec(`
      TRUNCATE t, names;
      INSERT INTO t VALUES
        ('${firstId}', 1, 'Ada', 'Lovelace', '{"color":"Blue"}',
         '2024-01-01T00:00:00Z', 10.50, 10, 'a', NULL, true, 'alpha'),
        ('00000000-0000-4000-8000-000000000002', 2, 'Grace', 'Hopper',
         '{"color":"green"}', '2024-01-03T00:00:00Z', 20.00, 20,
         'b', 'present', false, 'alpha'),
        ('00000000-0000-4000-8000-000000000003', 3, 'Alan', 'Turing',
         '{"color":"BLUE"}', '2024-01-05T00:00:00Z', 30.75, 30,
         'c', NULL, true, 'beta');
    `);
  });

  afterAll(async () => {
    await db?.close();
  });

  async function expectEquivalent(
    query: SelectQuery,
    expectedRows: unknown[],
    uncastSql?: string
  ) {
    const inline = await db.query(query.toSQL(pg));
    expect(inline.rows).toEqual(expectedRows);
    const { sql, bindings } = query.toSQLWithBindings(pg);
    if (uncastSql) expect(sql).toContain(uncastSql);
    const bound = await db.query(sql, bindings);
    expect(bound.rows).toEqual(inline.rows);
    expect(bound.rows).toEqual(expectedRows);
  }

  async function expectMutationEquivalent(
    query: InsertMutation | UpdateMutation | DeleteMutation,
    readback: SelectQuery,
    expectedRows: unknown[],
    affectedRows: number
  ) {
    const inlineSql = query.toSQL(pg);
    const { sql, bindings } = query.toSQLWithBindings(pg);
    const run = async (statement: string, values?: unknown[]) => {
      // Both mutations start from the same fixture, including INSERT/DELETE.
      await db.exec("BEGIN");
      try {
        const result = await db.query(statement, values);
        const { rows } = await db.query(readback.toSQL(pg));
        return { rows, affectedRows: result.affectedRows };
      } finally {
        await db.exec("ROLLBACK");
      }
    };
    const inline = await run(inlineSql);
    expect(inline.rows).toEqual(expectedRows);
    expect(inline.affectedRows).toBe(affectedRows);
    const bound = await run(sql, bindings);
    expect(bound).toEqual(inline);
    expect(bound.rows).toEqual(expectedRows);
  }

  const ordinals = () =>
    Q.select().from("t").field("ordinal").orderBy("ordinal");

  describe("literal typing boundaries", () => {
    it.each([0, "0"])(
      "infers COALESCE's numeric fallback %p from its column",
      async (fallback) => {
        await db.exec("UPDATE t SET amount = NULL WHERE ordinal = 1");
        await expectEquivalent(
          Q.select()
            .from("t")
            .field(Fn.ifnull("amount", Q.value(fallback)), "value")
            .orderBy("ordinal"),
          [{ value: "0" }, { value: "20.00" }, { value: "30.75" }],
          'COALESCE("amount",$1)'
        );
      }
    );

    it("infers COALESCE's text fallback from its column", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(Fn.ifnull("col", Q.value("x")), "value")
          .orderBy("ordinal"),
        [{ value: "x" }, { value: "present" }, { value: "x" }],
        'COALESCE("col",$1)'
      );
    });

    it("infers CASE's literal branch from its text column branch", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(
            Fn.if(Cond.equal("active", true), Q.value("a"), "col"),
            "value"
          )
          .orderBy("ordinal"),
        [{ value: "a" }, { value: "present" }, { value: "a" }],
        'CASE WHEN "active" = $1 THEN $2 ELSE "col" END'
      );
    });

    it("coerces CASE's string zero using its numeric column branch", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(
            Fn.if(Cond.equal("active", true), Q.value("0"), "price"),
            "value"
          )
          .orderBy("ordinal"),
        [{ value: 0 }, { value: 20 }, { value: 0 }],
        'CASE WHEN "active" = $1 THEN $2 ELSE "price" END'
      );
    });

    it("coerces arithmetic's string operand using its column sibling", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(Fn.multiply("price", Q.value("2")), "value")
          .orderBy("ordinal"),
        [{ value: 20 }, { value: 40 }, { value: 60 }],
        '("price" * $1)'
      );
    });

    it("types LOWER's single literal argument", async () => {
      await expectEquivalent(
        Q.select().field(
          new FunctionExpression("LOWER", Q.value("X")),
          "value"
        ),
        [{ value: "x" }],
        "LOWER(CAST($1 AS TEXT))"
      );
    });

    it("types a nested SUM(CASE) independently of its outer operation", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(
            Fn.add(
              Fn.sum(Fn.if(Cond.equal("active", true), Q.value(1), Q.value(0))),
              Q.value(1)
            ),
            "value"
          ),
        [{ value: 3 }],
        '(SUM(CASE WHEN "active" = $1 THEN $2::integer ELSE $3::integer END) + $4)'
      );
    });

    it("infers COALESCE's string fallback from a nested aggregate", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(Fn.ifnull(Fn.sum("price"), Q.value("0")), "value"),
        [{ value: 60 }],
        'COALESCE(SUM("price"),$1)'
      );
    });

    it("types literal COALESCE siblings while leaving null untyped", async () => {
      await expectEquivalent(
        Q.select().field(Fn.ifnull(Q.value(null), Q.value(1)), "value"),
        [{ value: 1 }],
        "COALESCE($1,$2::integer)"
      );
    });

    it.each([
      { name: "integer", value: 1, expected: 1, cast: "::integer" },
      { name: "boolean", value: true, expected: true, cast: "::boolean" },
      { name: "fraction", value: 1.5, expected: "1.5", cast: "::numeric" },
    ])(
      "returns a bare $name field without FROM with PostgreSQL's JS type",
      async ({ value, expected, cast }) => {
        await expectEquivalent(
          Q.select().field(Q.value(value), "value"),
          [{ value: expected }],
          `SELECT $1${cast} AS "value"`
        );
      }
    );
  });

  describe("function arguments, operations and SELECT fields", () => {
    // These are ordinary success assertions: unresolved bugs must leave CI red.
    it("executes CONCAT with a literal separator in a SELECT field", async () => {
      const query = Q.select()
        .from("t", "m")
        .field(Fn.concat("m.first_name", Q.value(" "), "m.last_name"), "name")
        .orderBy("m.ordinal");
      await expectEquivalent(query, [
        { name: "Ada Lovelace" },
        { name: "Grace Hopper" },
        { name: "Alan Turing" },
      ]);
    });

    it("executes lowercase concat with a literal argument", async () => {
      const query = Q.select()
        .from("t")
        .field(new FunctionExpression("concat", "col", Q.value("x")), "value")
        .orderBy("ordinal");
      expect(query.toSQLWithBindings(Q.flavors.postgres).sql).toBe(
        'SELECT concat("col",CAST($1 AS TEXT)) AS "value" FROM "t" ORDER BY "ordinal" ASC'
      );
      await expectEquivalent(query, [
        { value: "x" },
        { value: "presentx" },
        { value: "x" },
      ]);
    });

    it("executes SUM of numeric CASE branches with GROUP BY", async () => {
      const query = Q.select()
        .from("t")
        .field("team")
        .field(
          Fn.sum(Fn.if(Cond.equal("active", true), Q.value(1), Q.value(0))),
          "total"
        )
        .groupBy("team")
        .orderBy("team");
      await expectEquivalent(query, [
        { team: "alpha", total: 1 },
        { team: "beta", total: 1 },
      ]);
    });

    it.each([
      {
        name: "LIKE",
        caseInsensitive: false,
        pattern: "%Blue%",
        expected: [{ ordinal: 1 }],
      },
      {
        name: "ILIKE",
        caseInsensitive: true,
        pattern: "%blue%",
        expected: [{ ordinal: 1 }, { ordinal: 3 }],
      },
    ])(
      "executes CONCAT's cast-to-text pattern with $name",
      async ({ caseInsensitive, pattern, expected }) => {
        const query = Q.select()
          .from("t", "p")
          .field("p.ordinal")
          .where(Cond.greaterThan("p.ordinal", 0))
          .where(
            Cond.like(Fn.concat(Q.value(""), "p.parameters"), pattern, {
              caseInsensitive,
            })
          )
          .orderBy("p.ordinal");
        await expectEquivalent(query, expected);
      }
    );

    it("executes COALESCE with a text column and fallback", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(Fn.ifnull("col", Q.value("fallback")), "value")
          .orderBy("ordinal"),
        [{ value: "fallback" }, { value: "present" }, { value: "fallback" }]
      );
    });

    it("executes arithmetic with a column and literal operand", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(Fn.multiply("price", Q.value(2)), "doubled")
          .orderBy("ordinal"),
        [{ doubled: 20 }, { doubled: 40 }, { doubled: 60 }]
      );
    });

    it("executes arithmetic with two literal operands", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(Fn.multiply(Q.value(2), Q.value(3)), "product")
          .orderBy("ordinal"),
        [{ product: 6 }, { product: 6 }, { product: 6 }]
      );
    });

    it.each([
      { name: "integer", value: 1, expected: 1 },
      // PostgreSQL numeric is decoded as a string by PGlite, including inline.
      { name: "fraction", value: 1.5, expected: "1.5" },
      { name: "boolean", value: true, expected: true },
      { name: "string", value: "hello", expected: "hello" },
    ])(
      "executes a bare $name literal SELECT field with the same value type",
      async ({ value, expected }) => {
        await expectEquivalent(
          Q.select().from("t").field(Q.value(value), "one").orderBy("ordinal"),
          [{ one: expected }, { one: expected }, { one: expected }]
        );
      }
    );

    it("executes CASE with string result branches", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field(
            Fn.if(Cond.equal("active", true), Q.value("a"), Q.value("b")),
            "label"
          )
          .orderBy("ordinal"),
        [{ label: "a" }, { label: "b" }, { label: "a" }]
      );
    });

    it("executes a literal in an ORDER BY function", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field("ordinal")
          .orderBy(Fn.concat(Q.value(""), "first_name")),
        [{ ordinal: 1 }, { ordinal: 3 }, { ordinal: 2 }]
      );
    });

    it("executes numeric CASE branches inside a HAVING aggregate", async () => {
      await expectEquivalent(
        Q.select()
          .from("t")
          .field("team")
          .groupBy("team")
          .having(
            Cond.greaterThan(
              Fn.sum(Fn.if(Cond.equal("active", true), Q.value(1), Q.value(0))),
              0
            )
          )
          .orderBy("team"),
        [{ team: "alpha" }, { team: "beta" }]
      );
    });

    it("executes a literal in an INSERT SELECT function and verifies inserted rows", async () => {
      const query = Q.insert("names").select(
        Q.select()
          .from("t")
          .field(Fn.concat("first_name", Q.value(" "), "last_name")),
        ["name"]
      );
      await expectMutationEquivalent(
        query,
        Q.select().from("names").orderBy("name"),
        [
          { name: "Ada Lovelace" },
          { name: "Alan Turing" },
          { name: "Grace Hopper" },
        ],
        3
      );
    });
  });

  describe("positions where PostgreSQL infers parameter types", () => {
    it.each([
      { name: "Date", value: new Date("2024-01-02T12:00:00Z") },
      { name: "ISO string", value: "2024-01-02T12:00:00Z" },
    ])("infers a timestamptz comparison from $name", async ({ value }) => {
      await expectEquivalent(
        ordinals().where(Cond.greaterThan("created_at", value)),
        [{ ordinal: 2 }, { ordinal: 3 }],
        '"created_at" > $1'
      );
    });

    it("infers a uuid comparison from its column", async () => {
      await expectEquivalent(
        ordinals().where(Cond.equal("id", firstId)),
        [{ ordinal: 1 }],
        '"id" = $1'
      );
    });

    it("infers numeric equality from its column", async () => {
      await expectEquivalent(
        ordinals().where(Cond.equal("amount", 10.5)),
        [{ ordinal: 1 }],
        '"amount" = $1'
      );
    });

    it("infers both numeric BETWEEN endpoints from their column", async () => {
      await expectEquivalent(
        ordinals().where(Cond.between("amount", [10.5, 20])),
        [{ ordinal: 1 }, { ordinal: 2 }],
        '"amount" BETWEEN $1::numeric AND $2'
      );
    });

    it("infers text IN members from their column", async () => {
      await expectEquivalent(
        ordinals().where(Cond.in("status", ["a", "b"])),
        [{ ordinal: 1 }, { ordinal: 2 }],
        '"status" IN ($1, $2)'
      );
    });

    it.each([
      { name: "LIKE", caseInsensitive: false, pattern: "A%" },
      { name: "ILIKE", caseInsensitive: true, pattern: "a%" },
    ])(
      "infers the $name pattern from its text column",
      async ({ name, caseInsensitive, pattern }) => {
        await expectEquivalent(
          ordinals().where(
            Cond.like("first_name", pattern, { caseInsensitive })
          ),
          [{ ordinal: 1 }, { ordinal: 3 }],
          `"first_name" ${name} $1`
        );
      }
    );

    it("infers a bound LIMIT", async () => {
      await expectEquivalent(
        ordinals().limit(2),
        [{ ordinal: 1 }, { ordinal: 2 }],
        "LIMIT $1"
      );
    });

    it("infers a bound OFFSET", async () => {
      await expectEquivalent(
        ordinals().offset(2),
        [{ ordinal: 3 }],
        "OFFSET $1"
      );
    });

    it("infers bound LIMIT and OFFSET together", async () => {
      await expectEquivalent(
        ordinals().limit(1).offset(1),
        [{ ordinal: 2 }],
        "LIMIT $1 OFFSET $2"
      );
    });

    it("infers UPDATE SET values and WHERE parameters and verifies row effects", async () => {
      const query = Q.update("t")
        .set({ status: "updated", price: 99 })
        .where(Cond.equal("id", firstId));
      expect(query.toSQLWithBindings(pg).sql).toContain(
        'SET "status" = $1, "price" = $2 WHERE "id" = $3'
      );
      await expectMutationEquivalent(
        query,
        Q.select()
          .from("t")
          .field("ordinal")
          .field("status")
          .field("price")
          .orderBy("ordinal"),
        [
          { ordinal: 1, status: "updated", price: 99 },
          { ordinal: 2, status: "b", price: 20 },
          { ordinal: 3, status: "c", price: 30 },
        ],
        1
      );
    });

    it("infers DELETE WHERE parameters and verifies remaining rows", async () => {
      const query = Q.delete("t").where(Cond.equal("id", firstId));
      expect(query.toSQLWithBindings(pg).sql).toContain('WHERE "id" = $1');
      await expectMutationEquivalent(
        query,
        ordinals(),
        [{ ordinal: 2 }, { ordinal: 3 }],
        1
      );
    });

    it("infers mixed INSERT VALUES types and verifies inserted data", async () => {
      const row = {
        id: "00000000-0000-4000-8000-000000000004",
        ordinal: 4,
        first_name: "O'Brien",
        created_at: new Date("2024-01-07T12:00:00Z"),
        amount: 42.25,
        active: false,
        col: null,
      };
      const query = Q.insert("t").values([row]);
      expect(query.toSQLWithBindings(pg).sql).toContain(
        "VALUES ($1, $2, $3, $4, $5::numeric, $6, $7)"
      );
      await expectMutationEquivalent(
        query,
        Q.select()
          .from("t")
          .field("id")
          .field("ordinal")
          .field("first_name")
          .field("created_at")
          .field("amount")
          .field("active")
          .field("col")
          .where(Cond.equal("ordinal", 4)),
        [{ ...row, amount: "42.25" }],
        1
      );
    });
  });

  describe("small SELECT equivalence sweep over one seeded table", () => {
    const cases = [
      {
        name: "ordered projection",
        query: () => ordinals(),
        expected: [{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }],
      },
      {
        name: "combined conditions and pagination",
        query: () =>
          ordinals()
            .where(
              Cond.and([
                Cond.in("status", ["a", "b"]),
                Cond.between("amount", [10, 25]),
              ])
            )
            .limit(1)
            .offset(1),
        expected: [{ ordinal: 2 }],
      },
      {
        name: "NULL predicate",
        query: () => ordinals().where(Cond.isNull("col")),
        expected: [{ ordinal: 1 }, { ordinal: 3 }],
      },
      {
        name: "aggregate over numeric column",
        query: () => Q.select().from("t").field(Fn.sum("amount"), "total"),
        expected: [{ total: "61.25" }],
      },
      {
        name: "EXTRACT from timestamptz column",
        query: () =>
          Q.select()
            .from("t")
            .field(Fn.year("created_at"), "year")
            .orderBy("ordinal"),
        expected: [{ year: "2024" }, { year: "2024" }, { year: "2024" }],
      },
      {
        name: "DATEADD interval operand",
        query: () =>
          Q.select()
            .from("t")
            .field(Fn.dateAdd("created_at", 1, "day"), "next_day")
            .where(Cond.equal("ordinal", 1)),
        expected: [{ next_day: new Date("2024-01-02T00:00:00Z") }],
      },
      {
        name: "HAVING with column aggregate",
        query: () =>
          Q.select()
            .from("t")
            .field("team")
            .field(Fn.sum("price"), "total")
            .groupBy("team")
            .having(Cond.greaterThan(Fn.sum("price"), 25))
            .orderBy("team"),
        expected: [
          { team: "alpha", total: 30 },
          { team: "beta", total: 30 },
        ],
      },
      {
        name: "CONCAT of columns",
        query: () =>
          Q.select()
            .from("t")
            .field(Fn.concat("first_name", "last_name"), "name")
            .where(Cond.equal("ordinal", 1)),
        expected: [{ name: "AdaLovelace" }],
      },
    ];
    it.each(cases)("$name", async ({ query, expected }) => {
      await expectEquivalent(query(), expected);
    });
  });
});
