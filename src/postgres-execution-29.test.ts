import type { PGlite } from "@electric-sql/pglite";
import { Cond, Q } from "./index";
import type { SelectQuery } from "./index";
import { FunctionExpression } from "./Expression";

const supportsPGlite = Number(process.versions.node.split(".")[0]) >= 18;
if (!supportsPGlite) {
  console.info("Skipping PostgreSQL execution tests on Node.js <18.");
}
const describePostgres = supportsPGlite ? describe : describe.skip;

describePostgres("PostgreSQL case-insensitive built-in functions (#29)", () => {
  let db: PGlite;
  const pg = Q.flavors.postgres;

  beforeAll(async () => {
    // Keep the runtime import in this hook so Node 16 can skip loading PGlite.
    const { PGlite } = require("@electric-sql/pglite");
    db = new PGlite();
    await db.waitReady;
    await db.exec(`
      CREATE TABLE t (
        ordinal integer PRIMARY KEY,
        created_at timestamp,
        label text,
        score integer,
        active boolean
      );
      INSERT INTO t VALUES
        (1, '2023-12-15 00:00:00', 'beta', NULL, false),
        (2, '2024-01-15 00:00:00', 'alpha', 20, true),
        (3, '2025-02-15 00:00:00', 'gamma', 10, false);
    `);
  }, 30000);

  afterAll(async () => {
    await db?.close();
  });

  async function execute(sql: string, bindings?: unknown[]) {
    try {
      return await db.query(sql, bindings);
    } catch (error) {
      throw new Error(`PostgreSQL ${error.code}: ${error.message}`);
    }
  }

  async function expectEquivalent(query: SelectQuery, expectedRows: unknown[]) {
    const inline = await execute(query.toSQL(pg));
    expect(inline.rows).toEqual(expectedRows);
    const { sql, bindings } = query.toSQLWithBindings(pg);
    const bound = await execute(sql, bindings);
    expect(bound.rows).toEqual(expectedRows);
    expect(bound.rows).toEqual(inline.rows);
  }

  const ordinals = () => Q.select().from("t").field("ordinal");

  describe("SELECT fields", () => {
    it("executes year and YeAr", async () => {
      const query = (name: string) =>
        Q.select()
          .from("t")
          .field(new FunctionExpression(name, "created_at"), "value")
          .orderBy("ordinal");
      const expected = [
        { value: "2023" },
        { value: "2024" },
        { value: "2025" },
      ];
      await expectEquivalent(query("year"), expected);
      await expectEquivalent(query("YeAr"), expected);
    });

    it("executes month and MoNtH", async () => {
      const query = (name: string) =>
        Q.select()
          .from("t")
          .field(new FunctionExpression(name, "created_at"), "value")
          .orderBy("ordinal");
      const expected = [{ value: "12" }, { value: "1" }, { value: "2" }];
      await expectEquivalent(query("month"), expected);
      await expectEquivalent(query("MoNtH"), expected);
    });

    it("executes dateadd and DaTeAdD", async () => {
      const query = (name: string) =>
        Q.select()
          .from("t")
          .field(
            new FunctionExpression(
              name,
              "created_at",
              Q.value(1),
              Q.value("day")
            ),
            "value"
          )
          .orderBy("ordinal");
      const expected = [
        // PGlite decodes timestamp without time zone in the process's local zone.
        { value: new Date("2023-12-16T00:00:00") },
        { value: new Date("2024-01-16T00:00:00") },
        { value: new Date("2025-02-16T00:00:00") },
      ];
      await expectEquivalent(query("dateadd"), expected);
      await expectEquivalent(query("DaTeAdD"), expected);
    });

    it("executes if and iF", async () => {
      const query = (name: string) =>
        Q.select()
          .from("t")
          .field(
            new FunctionExpression(
              name,
              Cond.equal("active", true),
              Q.value(1),
              Q.value(0)
            ),
            "value"
          )
          .orderBy("ordinal");
      const expected = [{ value: 0 }, { value: 1 }, { value: 0 }];
      await expectEquivalent(query("if"), expected);
      await expectEquivalent(query("iF"), expected);
    });

    it("executes ifnull and IfNuLl", async () => {
      const query = (name: string) =>
        Q.select()
          .from("t")
          .field(new FunctionExpression(name, "score", Q.value(0)), "value")
          .orderBy("ordinal");
      const expected = [{ value: 0 }, { value: 20 }, { value: 10 }];
      await expectEquivalent(query("ifnull"), expected);
      await expectEquivalent(query("IfNuLl"), expected);
    });

    it("executes concat and CoNcAt with a bound literal beside a column", async () => {
      const query = (name: string) =>
        Q.select()
          .from("t")
          .field(new FunctionExpression(name, "label", Q.value("!")), "value")
          .orderBy("ordinal");
      const expected = [
        { value: "beta!" },
        { value: "alpha!" },
        { value: "gamma!" },
      ];
      await expectEquivalent(query("concat"), expected);
      await expectEquivalent(query("CoNcAt"), expected);
    });
  });

  describe("WHERE predicates", () => {
    it("executes year and YeAr", async () => {
      const query = (name: string) =>
        ordinals()
          .where(Cond.equal(new FunctionExpression(name, "created_at"), 2024))
          .orderBy("ordinal");
      await expectEquivalent(query("year"), [{ ordinal: 2 }]);
      await expectEquivalent(query("YeAr"), [{ ordinal: 2 }]);
    });

    it("executes month and MoNtH", async () => {
      const query = (name: string) =>
        ordinals()
          .where(Cond.equal(new FunctionExpression(name, "created_at"), 12))
          .orderBy("ordinal");
      await expectEquivalent(query("month"), [{ ordinal: 1 }]);
      await expectEquivalent(query("MoNtH"), [{ ordinal: 1 }]);
    });

    it("executes dateadd and DaTeAdD", async () => {
      const query = (name: string) =>
        ordinals()
          .where(
            Cond.equal(
              new FunctionExpression(
                name,
                "created_at",
                Q.value(1),
                Q.value("day")
              ),
              "2024-01-16 00:00:00"
            )
          )
          .orderBy("ordinal");
      await expectEquivalent(query("dateadd"), [{ ordinal: 2 }]);
      await expectEquivalent(query("DaTeAdD"), [{ ordinal: 2 }]);
    });

    it("executes if and iF", async () => {
      const query = (name: string) =>
        ordinals()
          .where(
            Cond.equal(
              new FunctionExpression(
                name,
                Cond.equal("active", true),
                Q.value(1),
                Q.value(0)
              ),
              1
            )
          )
          .orderBy("ordinal");
      await expectEquivalent(query("if"), [{ ordinal: 2 }]);
      await expectEquivalent(query("iF"), [{ ordinal: 2 }]);
    });

    it("executes ifnull and IfNuLl", async () => {
      const query = (name: string) =>
        ordinals()
          .where(
            Cond.equal(new FunctionExpression(name, "score", Q.value(0)), 0)
          )
          .orderBy("ordinal");
      await expectEquivalent(query("ifnull"), [{ ordinal: 1 }]);
      await expectEquivalent(query("IfNuLl"), [{ ordinal: 1 }]);
    });

    it("executes concat and CoNcAt with a bound literal beside a column", async () => {
      const query = (name: string) =>
        ordinals()
          .where(
            Cond.equal(
              new FunctionExpression(name, "label", Q.value("!")),
              "alpha!"
            )
          )
          .orderBy("ordinal");
      await expectEquivalent(query("concat"), [{ ordinal: 2 }]);
      await expectEquivalent(query("CoNcAt"), [{ ordinal: 2 }]);
    });
  });

  describe("ORDER BY expressions", () => {
    it("executes year and YeAr", async () => {
      const query = (name: string) =>
        ordinals().orderBy(new FunctionExpression(name, "created_at"), "DESC");
      const expected = [{ ordinal: 3 }, { ordinal: 2 }, { ordinal: 1 }];
      await expectEquivalent(query("year"), expected);
      await expectEquivalent(query("YeAr"), expected);
    });

    it("executes month and MoNtH", async () => {
      const query = (name: string) =>
        ordinals().orderBy(new FunctionExpression(name, "created_at"), "DESC");
      const expected = [{ ordinal: 1 }, { ordinal: 3 }, { ordinal: 2 }];
      await expectEquivalent(query("month"), expected);
      await expectEquivalent(query("MoNtH"), expected);
    });

    it("executes dateadd and DaTeAdD", async () => {
      const query = (name: string) =>
        ordinals().orderBy(
          new FunctionExpression(
            name,
            "created_at",
            Q.value(1),
            Q.value("day")
          ),
          "DESC"
        );
      const expected = [{ ordinal: 3 }, { ordinal: 2 }, { ordinal: 1 }];
      await expectEquivalent(query("dateadd"), expected);
      await expectEquivalent(query("DaTeAdD"), expected);
    });

    it("executes if and iF", async () => {
      const query = (name: string) =>
        ordinals()
          .orderBy(
            new FunctionExpression(
              name,
              Cond.equal("active", true),
              Q.value(1),
              Q.value(0)
            ),
            "DESC"
          )
          .orderBy("ordinal");
      const expected = [{ ordinal: 2 }, { ordinal: 1 }, { ordinal: 3 }];
      await expectEquivalent(query("if"), expected);
      await expectEquivalent(query("iF"), expected);
    });

    it("executes ifnull and IfNuLl", async () => {
      const query = (name: string) =>
        ordinals().orderBy(
          new FunctionExpression(name, "score", Q.value(0)),
          "DESC"
        );
      const expected = [{ ordinal: 2 }, { ordinal: 3 }, { ordinal: 1 }];
      await expectEquivalent(query("ifnull"), expected);
      await expectEquivalent(query("IfNuLl"), expected);
    });

    it("executes concat and CoNcAt with a bound literal beside a column", async () => {
      const query = (name: string) =>
        ordinals().orderBy(new FunctionExpression(name, "label", Q.value("!")));
      const expected = [{ ordinal: 2 }, { ordinal: 1 }, { ordinal: 3 }];
      await expectEquivalent(query("concat"), expected);
      await expectEquivalent(query("CoNcAt"), expected);
    });
  });
});
