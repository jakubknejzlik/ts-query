import {
  Q,
  T,
  L,
  CreateTable,
  DropTable,
  AlterTable,
  UnsupportedOperationError,
  flavorCapabilities,
  DefaultFlavor,
  ISQLFlavor,
  summarize,
} from "./index";

const typedUnsupported = (fn: () => unknown) => {
  try {
    fn();
    throw new Error("Expected unsupported operation");
  } catch (error) {
    expect(error).toBeInstanceOf(UnsupportedOperationError);
    expect((error as UnsupportedOperationError).code).toBe(
      "unsupported_operation"
    );
  }
};
describe("Typed DDL", () => {
  for (const dialect of ["duckdb", "postgres", "sqlite", "mysql"] as const) {
    const flavor = Q.flavors[dialect];
    const q = dialect === "mysql" || dialect === "sqlite" ? "`" : '"';
    const id = (name: string) => `${q}${name}${q}`;
    it(`renders every DDL operation and table flag for ${dialect}`, () => {
      expect(
        Q.createTable("app.items")
          .ifNotExists()
          .column("id", T.int64(), { nullable: false, primaryKey: true })
          .toSQL(flavor)
      ).toBe(
        `CREATE TABLE IF NOT EXISTS ${id("app")}.${id("items")} (${id("id")} ${
          dialect === "sqlite" ? "INTEGER" : "BIGINT"
        } NOT NULL PRIMARY KEY)`
      );
      expect(Q.dropTable("app.items").ifExists().toSQL(flavor)).toBe(
        `DROP TABLE IF EXISTS ${id("app")}.${id("items")}`
      );
      expect(
        Q.alterTable("items")
          .addColumn("n", T.int32(), { default: L.number(3) })
          .toSQL(flavor)
      ).toBe(
        `ALTER TABLE ${id("items")} ADD COLUMN ${id("n")} ${
          dialect === "mysql" ? "INT" : "INTEGER"
        } DEFAULT 3`
      );
      expect(Q.alterTable("items").dropColumn("n").toSQL(flavor)).toBe(
        `ALTER TABLE ${id("items")} DROP COLUMN ${id("n")}`
      );
      expect(
        Q.alterTable("items").renameColumn("old", "new").toSQL(flavor)
      ).toBe(
        `ALTER TABLE ${id("items")} RENAME COLUMN ${id("old")} TO ${id("new")}`
      );
      const alter = Q.alterTable("items", { ifExists: true }).dropColumn("n");
      if (flavor.capabilities.alterIfExists)
        expect(alter.toSQL(flavor)).toBe(
          `ALTER TABLE IF EXISTS ${id("items")} DROP COLUMN ${id("n")}`
        );
      else typedUnsupported(() => alter.toSQL(flavor));
      expect(
        Q.createTable("NULL").column("NULL", T.int32()).toSQL(flavor)
      ).toBe(
        `CREATE TABLE ${id("NULL")} (${id("NULL")} ${
          dialect === "mysql" ? "INT" : "INTEGER"
        })`
      );
    });
    const expected = {
      duckdb: [
        "BOOLEAN",
        "INTEGER",
        "BIGINT",
        "DOUBLE",
        "DECIMAL(18,2)",
        "VARCHAR",
        "DATE",
        "TIMESTAMP",
        "TIMESTAMPTZ",
        "JSON",
        "UUID",
      ],
      postgres: [
        "BOOLEAN",
        "INTEGER",
        "BIGINT",
        "DOUBLE PRECISION",
        "DECIMAL(18,2)",
        "TEXT",
        "DATE",
        "TIMESTAMP",
        "TIMESTAMPTZ",
        "JSON",
        "UUID",
      ],
      sqlite: ["BOOLEAN", "INTEGER", "INTEGER", "REAL", undefined, "TEXT"],
      mysql: [
        "BOOLEAN",
        "INT",
        "BIGINT",
        "DOUBLE",
        "DECIMAL(18,2)",
        "TEXT",
        "DATE",
        "DATETIME",
        undefined,
        "JSON",
      ],
    }[dialect];
    const types = [
      T.boolean(),
      T.int32(),
      T.int64(),
      T.float64(),
      T.decimal(18, 2),
      T.string(),
      T.date(),
      T.timestamp(),
      T.timestamptz(),
      T.json(),
      T.uuid(),
    ];
    for (const [index, type] of types.entries()) {
      it(`renders or explicitly rejects ${type.kind} for ${dialect}`, () => {
        const create = Q.createTable("t").column("c", type);
        const add = Q.alterTable("t").addColumn("c", type);
        if (expected[index]) {
          expect(create.toSQL(flavor)).toBe(
            `CREATE TABLE ${id("t")} (${id("c")} ${expected[index]})`
          );
          expect(add.toSQL(flavor)).toBe(
            `ALTER TABLE ${id("t")} ADD COLUMN ${id("c")} ${expected[index]}`
          );
        } else {
          typedUnsupported(() => create.toSQL(flavor));
          typedUnsupported(() => add.toSQL(flavor));
        }
      });
    }
    it(`renders typed defaults and nullable options for ${dialect}`, () => {
      const query = Q.createTable("t")
        .column("a", T.boolean(), { default: L.boolean(true), nullable: false })
        .column("b", T.float64(), { default: L.number(-1.5) })
        .column("c", T.int32(), { default: L.null(), nullable: true });
      expect(query.toSQL(flavor)).toContain("DEFAULT TRUE");
      expect(query.toSQL(flavor)).toContain("DEFAULT -1.5");
      expect(query.toSQL(flavor)).toContain("NULL DEFAULT NULL");
      if (dialect !== "mysql")
        expect(
          Q.createTable("t")
            .column("s", T.string(), {
              default: L.string("'); DROP TABLE t;--\\"),
            })
            .toSQL(flavor)
        ).toContain(
          dialect === "postgres"
            ? "DEFAULT E'''); DROP TABLE t;--\\\\'"
            : "DEFAULT '''); DROP TABLE t;--\\'"
        );
      else
        expect(
          Q.createTable("t")
            .column("d", T.date(), { default: L.string("2025-01-01") })
            .toSQL(flavor)
        ).toContain("DEFAULT '2025-01-01'");
    });
    it(`round trips every DDL operation for ${dialect}`, () => {
      const nodes = [
        Q.createTable("t").column("n", T.int64(), { default: L.number(1) }),
        Q.dropTable("t").ifExists(),
        Q.alterTable("t").addColumn("n", T.int32()),
        Q.alterTable("t").dropColumn("n"),
        Q.alterTable("t").renameColumn("n", "m"),
      ];
      for (const node of nodes)
        for (const compress of [false, true])
          for (const version of [undefined, 1] as const) {
            const copy = Q.deserialize(node.serialize({ version, compress }), {
              allowedNodes: [node.toJSON().type],
              allowRaw: false,
              functions: [],
              maxDepth: 0,
            });
            expect(copy).toEqual(node);
            expect(copy.toSQL(flavor)).toBe(node.toSQL(flavor));
            expect(copy.toSQLWithBindings(flavor)).toEqual({
              sql: node.toSQL(flavor),
              bindings: [],
            });
            expect(node.clone()).toEqual(node);
          }
    });
  }
  it("throws typed errors for unsupported operations, types, and options without dropping requests", () => {
    for (const flavor of [Q.flavors.awsTimestream, new DefaultFlavor()]) {
      for (const node of [
        Q.createTable("t").column("c", T.int32()),
        Q.dropTable("t"),
        Q.alterTable("t").addColumn("c", T.int32()),
        Q.alterTable("t").dropColumn("c"),
        Q.alterTable("t").renameColumn("c", "d"),
      ])
        typedUnsupported(() => node.toSQL(flavor));
    }
    expect(
      Q.alterTable("t")
        .addColumn("c", T.int32(), { nullable: false })
        .toSQL(Q.flavors.duckdb)
    ).toContain("NOT NULL");
    typedUnsupported(() =>
      Q.createTable("t")
        .column("c", T.json(), { primaryKey: true })
        .toSQL(Q.flavors.postgres)
    );
    typedUnsupported(() =>
      Q.alterTable("t")
        .addColumn("c", T.int32(), { primaryKey: true })
        .toSQL(Q.flavors.duckdb)
    );
    typedUnsupported(() =>
      Q.alterTable("t")
        .addColumn("c", T.int32(), { primaryKey: true })
        .toSQL(Q.flavors.sqlite)
    );
    typedUnsupported(() =>
      Q.alterTable("t")
        .addColumn("c", T.int32(), { nullable: false })
        .toSQL(Q.flavors.sqlite)
    );
    expect(
      Q.alterTable("t")
        .addColumn("c", T.int32(), { nullable: false, default: L.number(1) })
        .toSQL(Q.flavors.sqlite)
    ).toContain("NOT NULL DEFAULT 1");
    for (const type of [T.string(), T.json()]) {
      typedUnsupported(() =>
        Q.createTable("t")
          .column("c", type, { default: L.string("x") })
          .toSQL(Q.flavors.mysql)
      );
      typedUnsupported(() =>
        Q.createTable("t")
          .column("c", type, { primaryKey: true })
          .toSQL(Q.flavors.mysql)
      );
    }
    typedUnsupported(() =>
      Q.createTable("t").column("c", T.decimal(38, 31)).toSQL(Q.flavors.mysql)
    );
    typedUnsupported(() =>
      Q.createTable("t")
        .column("c", T.date(), { default: L.string("a\\'; DROP TABLE t;--") })
        .toSQL(Q.flavors.mysql)
    );
  });
  it("keeps custom ISQLFlavor implementations source compatible and fails closed without capabilities", () => {
    const f = Q.flavors.postgres;
    const custom: ISQLFlavor = {
      escapeColumn: f.escapeColumn.bind(f),
      escapeTable: f.escapeTable.bind(f),
      escapeRawValue: f.escapeRawValue.bind(f),
      escapeValue: f.escapeValue.bind(f),
      escapeLimitAndOffset: f.escapeLimitAndOffset.bind(f),
      escapeFunction: f.escapeFunction.bind(f),
      escapeOperation: f.escapeOperation.bind(f),
      escapeUnion: f.escapeUnion.bind(f),
      escapeLikeCondition: f.escapeLikeCondition.bind(f),
    };
    expect(Q.select().from("t").toSQL(custom)).toBe('SELECT * FROM "t"');
    typedUnsupported(() => Q.dropTable("t").toSQL(custom));
    expect(Object.isFrozen(flavorCapabilities)).toBe(true);
    expect(Object.isFrozen(flavorCapabilities.duckdb.operations)).toBe(true);
  });
  it("rejects invalid decimal bounds, raw types, and identifier injection in builders", () => {
    for (const args of [
      [0, 0],
      [39, 0],
      [5, -1],
      [5, 6],
      [1.5, 0],
      [5, NaN],
      [Infinity, 0],
    ])
      expect(() => T.decimal(args[0], args[1])).toThrow();
    expect(T.decimal(38, 38)).toEqual({
      kind: "decimal",
      precision: 38,
      scale: 38,
    });
    for (const name of [
      'a"; DROP TABLE x;--',
      "*",
      "a.*",
      "a..b",
      "a@b",
      "a.b.c",
      "",
      "x;--",
    ]) {
      expect(() => Q.createTable(name)).toThrow();
      expect(() => Q.dropTable(name)).toThrow();
      expect(() => Q.alterTable(name)).toThrow();
    }
    for (const name of ["a.b", "*", 'a"; DROP TABLE x;--']) {
      expect(() => Q.createTable("t").column(name, T.int32())).toThrow();
      expect(() => Q.alterTable("t").dropColumn(name)).toThrow();
      expect(() => Q.alterTable("t").renameColumn("c", name)).toThrow();
    }
    for (const type of [
      "INTEGER",
      { kind: "raw", value: "INTEGER); DROP TABLE t;--" },
      { kind: "INT); DROP TABLE t;--" },
      { kind: "int32", sql: "raw" },
    ])
      expect(() => Q.createTable("t").column("c", type as any)).toThrow();
  });
  it("rejects invalid defaults, unknown options, conflicting columns and incomplete actions", () => {
    for (const options of [
      { sql: "raw" },
      { nullable: "yes" },
      { primaryKey: 1 },
      { primaryKey: true, nullable: true },
      { nullable: false, default: L.null() },
      { default: Q.raw("now()") },
      { default: { kind: "string", value: "x", sql: "raw" } },
    ])
      expect(() =>
        Q.createTable("t").column("c", T.int32(), options as any)
      ).toThrow();
    for (const value of [NaN, Infinity])
      expect(() => L.number(value)).toThrow();
    expect(() => L.string("\0")).toThrow();
    expect(() => Q.createTable("t", { ifNotExists: null } as any)).toThrow();
    expect(() => Q.dropTable("t", { ifExists: null } as any)).toThrow();
    expect(() =>
      Q.createTable("t").column("a", T.int32()).column("A", T.int32())
    ).toThrow();
    expect(() =>
      Q.createTable("t")
        .column("a", T.int32(), { primaryKey: true })
        .column("b", T.int32(), { primaryKey: true })
    ).toThrow();
    expect(() => Q.createTable("t").serialize()).toThrow();
    expect(() => Q.alterTable("t").toSQL()).toThrow();
    expect(() =>
      Q.alterTable("t").dropColumn("c").renameColumn("d", "e")
    ).toThrow();
  });
  it("exposes immutable typed accessors and visits schema names", () => {
    const base = Q.createTable("t");
    const created = base.column("c", T.int32(), { default: L.number(2) });
    expect(base.getColumns()).toEqual([]);
    expect(Object.isFrozen(created.getColumns()[0].options.default)).toBe(true);
    expect(summarize(created)).toMatchObject({
      tables: ["t"],
      columns: [{ name: "c" }],
      hasRaw: false,
    });
    expect(
      summarize(Q.alterTable("t").renameColumn("c", "d")).columns.map(
        (c) => c.name
      )
    ).toEqual(["c", "d"]);
    expect(CreateTable.fromJSON(created.toJSON())).toEqual(created);
    expect(DropTable.fromJSON(Q.dropTable("t").toJSON()).getTableName()).toBe(
      "t"
    );
    expect(
      AlterTable.fromJSON(
        Q.alterTable("t").dropColumn("c").toJSON()
      ).getAction()
    ).toEqual({ kind: "dropColumn", name: "c" });
  });
});
