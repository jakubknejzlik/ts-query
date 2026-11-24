import { PGlite } from "@electric-sql/pglite";
import { Q, T, L } from "./index";

it("executes advertised PostgreSQL schema operations, types and introspection", async () => {
  const db = new PGlite();
  await db.waitReady;
  const flavor = Q.flavors.postgres;
  try {
    let create = Q.createTable("typed").ifNotExists();
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
    await db.exec(create.toSQL(flavor));
    await db.exec(create.toSQL(flavor));
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
      T.uuid(),
    ]) {
      await db.exec(
        Q.createTable(`pk_${type.kind}`)
          .column("key", type, { primaryKey: true })
          .toSQL(flavor)
      );
    }
    await db.exec(
      Q.alterTable("typed")
        .ifExists()
        .addColumn("extra", T.int32(), {
          nullable: false,
          default: L.number(7),
        })
        .toSQL(flavor)
    );
    await db.exec(
      Q.alterTable("typed")
        .ifExists()
        .renameColumn("extra", "points")
        .toSQL(flavor)
    );
    await db.exec(
      Q.alterTable("typed").ifExists().dropColumn("points").toSQL(flavor)
    );
    await db.exec(
      Q.alterTable("typed")
        .addColumn("key", T.int64(), { primaryKey: true })
        .toSQL(flavor)
    );
    expect((await db.query(Q.showSchemas().toSQL(flavor))).rows).toContainEqual(
      { schema_name: "public" }
    );
    expect(
      (await db.query(Q.showTables({ schema: "public" }).toSQL(flavor))).rows
    ).toContainEqual({
      table_schema: "public",
      table_name: "typed",
      table_type: "BASE TABLE",
    });
    for (const node of [
      Q.describeTable("public.typed"),
      Q.showColumns("typed"),
    ]) {
      const result = await db.query(node.toSQL(flavor));
      expect(result.rows).toHaveLength(12);
      const bound = node.toSQLWithBindings(flavor);
      expect((await db.query(bound.sql, bound.bindings)).rows).toEqual(
        result.rows
      );
    }
    await db.exec(
      Q.createTable("defaults")
        .column("id", T.int64(), { primaryKey: true })
        .column("value", T.string(), {
          default: L.string("a'); DROP TABLE defaults;--\\"),
        })
        .toSQL(flavor)
    );
    await db.exec(
      Q.insert("defaults")
        .values([{ id: 1 }])
        .toSQL(flavor)
    );
    expect(
      (await db.query(Q.select().field("value").from("defaults").toSQL(flavor)))
        .rows
    ).toEqual([{ value: "a'); DROP TABLE defaults;--\\" }]);
    await db.exec(Q.dropTable("typed").ifExists().toSQL(flavor));
    await db.exec(Q.dropTable("typed").ifExists().toSQL(flavor));
  } finally {
    await db.close();
  }
}, 30000);

it("keeps typed defaults opaque with PostgreSQL standard_conforming_strings on and off", async () => {
  const db = new PGlite();
  await db.waitReady;
  try {
    for (const setting of ["on", "off"]) {
      await db.exec(`SET standard_conforming_strings = ${setting}`);
      const text = "a\\'); DROP TABLE safety;--";
      await db.exec(
        Q.createTable("safety")
          .column("id", T.int32())
          .column("text", T.string(), { default: L.string(text) })
          .toSQL(Q.flavors.postgres)
      );
      await db.exec(
        Q.insert("safety")
          .values([{ id: 1 }])
          .toSQL(Q.flavors.postgres)
      );
      expect(
        (
          await db.query(
            Q.select().field("text").from("safety").toSQL(Q.flavors.postgres)
          )
        ).rows
      ).toEqual([{ text }]);
      await db.exec(Q.dropTable("safety").toSQL(Q.flavors.postgres));
    }
  } finally {
    await db.close();
  }
}, 30000);
