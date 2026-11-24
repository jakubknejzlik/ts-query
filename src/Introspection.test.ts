import {
  Q,
  DeserializeError,
  UnsupportedOperationError,
  ShowSchemas,
  ShowTables,
  DescribeTable,
  ShowColumns,
  summarize,
} from "./index";

describe("Declarative introspection", () => {
  for (const name of ["duckdb", "postgres"] as const) {
    const flavor = Q.flavors[name];
    it(`renders every introspection request for ${name}`, () => {
      expect(Q.showSchemas().toSQL(flavor)).toBe(
        "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name"
      );
      expect(Q.showTables().toSQL(flavor)).toBe(
        "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_catalog = current_database() AND table_schema = current_schema() ORDER BY table_name"
      );
      expect(Q.showTables({ schema: "app" }).toSQL(flavor)).toContain(
        "table_schema = 'app'"
      );
      const columns =
        "SELECT column_name, data_type, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_catalog = current_database() AND table_schema = 'app' AND table_name = 'items' ORDER BY ordinal_position";
      expect(Q.describeTable("app.items").toSQL(flavor)).toBe(columns);
      expect(Q.showColumns("app.items").toSQL(flavor)).toBe(columns);
      expect(Q.showColumns("items").toSQL(flavor)).toContain(
        "table_schema = current_schema() AND table_name = 'items'"
      );
      expect(Q.showColumns("app.items").toSQLWithBindings(flavor)).toEqual({
        sql: columns.replace("'app'", "$1").replace("'items'", "$2"),
        bindings: ["app", "items"],
      });
    });
    it(`round trips every introspection kind for ${name}`, () => {
      for (const node of [
        Q.showSchemas(),
        Q.showTables(),
        Q.showTables({ schema: "app" }),
        Q.describeTable("app.items"),
        Q.showColumns("items"),
      ])
        for (const compress of [true, false])
          for (const version of [undefined, 1] as const) {
            const copy = Q.deserialize(node.serialize({ compress, version }), {
              allowedNodes: [node.toJSON().type],
            });
            expect(copy).toEqual(node);
            expect(copy.toSQL(flavor)).toBe(node.toSQL(flavor));
            expect(node.clone()).toEqual(node);
          }
    });
  }
  it("throws typed errors for every unsupported introspection flavor and operation", () => {
    for (const flavor of [
      Q.flavors.mysql,
      Q.flavors.sqlite,
      Q.flavors.awsTimestream,
    ])
      for (const node of [
        Q.showSchemas(),
        Q.showTables(),
        Q.describeTable("items"),
        Q.showColumns("items"),
      ]) {
        expect(() => node.toSQL(flavor)).toThrow(UnsupportedOperationError);
        try {
          node.toSQL(flavor);
        } catch (e) {
          expect((e as UnsupportedOperationError).code).toBe(
            "unsupported_operation"
          );
        }
      }
  });
  it("exposes plain request data for consumers without execution or registry access", () => {
    expect(Q.showSchemas().toJSON()).toEqual({ type: "ShowSchemas" });
    expect(Q.showTables({ schema: "app" }).getSchema()).toBe("app");
    expect(Q.describeTable("app.items").getTableName()).toBe("app.items");
    expect(Q.showColumns("items").toJSON()).toEqual({
      type: "ShowColumns",
      tableName: "items",
    });
    expect(summarize(Q.describeTable("items"))).toMatchObject({
      tables: ["items"],
      kind: "DescribeTable",
      hasRaw: false,
    });
    expect(ShowSchemas.fromJSON({ type: "ShowSchemas" })).toBeInstanceOf(
      ShowSchemas
    );
    expect(
      ShowTables.fromJSON({ type: "ShowTables", schema: "app" }).getSchema()
    ).toBe("app");
    expect(
      DescribeTable.fromJSON({
        type: "DescribeTable",
        tableName: "t",
      }).getTableName()
    ).toBe("t");
    expect(
      ShowColumns.fromJSON({
        type: "ShowColumns",
        tableName: "t",
      }).getTableName()
    ).toBe("t");
  });
  it("rejects introspection identifier injection and unknown builder fields", () => {
    for (const name of [
      'a"; DROP TABLE x;--',
      "*",
      "a.*",
      "a.b.c",
      "a@b",
      "",
    ]) {
      expect(() => Q.showTables({ schema: name })).toThrow(DeserializeError);
      expect(() => Q.describeTable(name)).toThrow(DeserializeError);
      expect(() => Q.showColumns(name)).toThrow(DeserializeError);
    }
    expect(() => Q.showTables({ schema: "a.b" })).toThrow();
    expect(() => Q.showTables({ schema: "app", raw: "sql" } as any)).toThrow();
  });
});
