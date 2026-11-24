import { DuckDBInstance } from "@duckdb/node-api";
import { Q, T, L, Fn, Cond, DuckDBFlavor } from "./index";

const flavor = new DuckDBFlavor({ timezone: "UTC" });
describe("DuckDB generated SQL execution", () => {
  it("executes every current/previous price difference branch with legacy literals", async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      await connection.run(
        Q.createTable("prices")
          .column("id", T.int32())
          .column("current_price", T.float64())
          .column("previous_price", T.float64())
          .toSQL(flavor)
      );
      await connection.run(
        Q.insert("prices")
          .values([
            { id: 1, current_price: 0, previous_price: 0 },
            { id: 2, current_price: 10, previous_price: 0 },
            { id: 3, current_price: 0, previous_price: 10 },
            { id: 4, current_price: 15, previous_price: 10 },
            { id: 5, current_price: -5, previous_price: -10 },
          ])
          .toSQL(flavor)
      );
      const query = Q.select()
        .field(
          Fn.priceCurrentAndPreviousDiffField({
            thisYearColumn: "current_price",
            lastYearColumn: "previous_price",
          }),
          "diff"
        )
        .from("prices")
        .orderBy("id");
      const expected = [[0], [null], [-1], [0.5], [0.5]];
      expect(
        (await connection.runAndReadAll(query.toSQL(flavor))).getRows()
      ).toEqual(expected);
      const bound = query.toSQLWithBindings(flavor);
      expect(
        (await connection.runAndReadAll(bound.sql, bound.bindings as any)).getRows()
      ).toEqual(expected);
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
  it("lists only schemas from the current catalog after ATTACH", async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      await connection.run("ATTACH ':memory:' AS attached");
      await connection.run("CREATE SCHEMA attached.attached_only");
      await connection.run("CREATE SCHEMA current_only");
      const rows = (
        await connection.runAndReadAll(Q.showSchemas().toSQL(flavor))
      ).getRows();
      expect(rows.filter((row) => row[0] === "main")).toHaveLength(1);
      expect(rows).toContainEqual(["current_only"]);
      expect(rows).not.toContainEqual(["attached_only"]);
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
  it("executes generated SELECT, every DDL action, defaults and all introspection requests in memory", async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      const create = Q.createTable("items")
        .ifNotExists()
        .column("id", T.int64(), { primaryKey: true })
        .column("name", T.string(), {
          default: L.string("a'); DROP TABLE items;--\\"),
        })
        .column("active", T.boolean(), { default: L.boolean(true) });
      await connection.run(create.toSQL(flavor));
      await connection.run(create.toSQL(flavor));
      await connection.run(
        Q.insert("items")
          .values([{ id: 1 }])
          .toSQL(flavor)
      );
      const query = Q.select()
        .field("id")
        .field("name")
        .from("items")
        .where(Cond.equal("active", true))
        .limit(10)
        .offset(0);
      expect(
        (await connection.runAndReadAll(query.toSQL(flavor))).getRows()
      ).toEqual([[BigInt(1), "a'); DROP TABLE items;--\\"]]);
      const bound = query.toSQLWithBindings(flavor);
      expect(
        (
          await connection.runAndReadAll(bound.sql, bound.bindings as any)
        ).getRows()
      ).toEqual([[BigInt(1), "a'); DROP TABLE items;--\\"]]);
      await connection.run(
        Q.alterTable("items")
          .addColumn("score", T.int32(), {
            nullable: false,
            default: L.number(7),
          })
          .toSQL(flavor)
      );
      await connection.run(
        Q.alterTable("items")
          .ifExists()
          .renameColumn("score", "points")
          .toSQL(flavor)
      );
      expect(
        (
          await connection.runAndReadAll(
            Q.select().field("points").from("items").toSQL(flavor)
          )
        ).getRows()
      ).toEqual([[7]]);
      expect(
        (await connection.runAndReadAll(Q.showSchemas().toSQL(flavor)))
          .getRows()
          .some((r) => r[0] === "main")
      ).toBe(true);
      expect(
        (
          await connection.runAndReadAll(
            Q.showTables({ schema: "main" }).toSQL(flavor)
          )
        ).getRows()
      ).toContainEqual(["main", "items", "BASE TABLE"]);
      for (const node of [
        Q.describeTable("main.items"),
        Q.showColumns("items"),
      ]) {
        const result = await connection.runAndReadAll(node.toSQL(flavor));
        expect(result.getRows().map((r) => r[0])).toEqual([
          "id",
          "name",
          "active",
          "points",
        ]);
        const bound = node.toSQLWithBindings(flavor);
        expect(
          (
            await connection.runAndReadAll(bound.sql, bound.bindings as any)
          ).getRows()
        ).toEqual(result.getRows());
      }
      await connection.run(
        Q.alterTable("items").dropColumn("points").toSQL(flavor)
      );
      const matched = Q.select()
        .field("id")
        .from("items")
        .where(Cond.like("name", "A%", { caseInsensitive: true }));
      expect(
        (await connection.runAndReadAll(matched.toSQL(flavor))).getRows()
      ).toEqual([[BigInt(1)]]);
      const temporal = Q.select()
        .field(Fn.year(Q.value(new Date("2025-01-01T00:00:00Z"))), "year")
        .field(
          Fn.dateAdd(Q.value(new Date("2025-01-01T00:00:00Z")), 1, "day"),
          "tomorrow"
        );
      const temporalBound = temporal.toSQLWithBindings(flavor);
      expect(
        (
          await connection.runAndReadAll(
            temporalBound.sql,
            temporalBound.bindings as any
          )
        ).getRowsJson()
      ).toEqual(
        (await connection.runAndReadAll(temporal.toSQL(flavor))).getRowsJson()
      );
      await connection.run(Q.dropTable("items").ifExists().toSQL(flavor));
      await connection.run(Q.dropTable("items").ifExists().toSQL(flavor));
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
  it("executes every advertised DuckDB column type and rejects quoted-name SELECT injection as an identifier", async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      let create = Q.createTable("typed");
      for (const type of [
        T.boolean(),
        T.int32(),
        T.int64(),
        T.float64(),
        T.decimal(38, 2),
        T.string(),
        T.date(),
        T.timestamp(),
        T.timestamptz(),
        T.json(),
        T.uuid(),
      ])
        create = create.column(type.kind, type);
      await connection.run(create.toSQL(flavor));
      for (const type of [
        T.boolean(),
        T.int32(),
        T.int64(),
        T.float64(),
        T.decimal(38, 2),
        T.string(),
        T.date(),
        T.timestamp(),
        T.timestamptz(),
        T.json(),
        T.uuid(),
      ]) {
        await connection.run(
          Q.createTable(`pk_${type.kind}`)
            .column("key", type, { primaryKey: true })
            .toSQL(flavor)
        );
      }
      await connection.run(
        Q.alterTable("typed")
          .ifExists()
          .addColumn("extra", T.int64())
          .toSQL(flavor)
      );
      await connection.run(
        Q.alterTable("typed").ifExists().dropColumn("extra").toSQL(flavor)
      );
      await expect(
        connection.run(
          Q.select()
            .field(Q.column('a"; DROP TABLE typed;--'))
            .from("typed")
            .toSQL(flavor)
        )
      ).rejects.toThrow(/Binder Error/);
      expect(
        (await connection.runAndReadAll(Q.showTables().toSQL(flavor))).getRows()
      ).toContainEqual(["main", "typed", "BASE TABLE"]);
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
});
