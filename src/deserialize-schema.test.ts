import {
  Q,
  T,
  L,
  DeserializeError,
  DeserializeOptions,
  schemaNodeKinds,
  CreateTable,
  AlterTable,
  ShowTables,
  Cond,
  Fn,
  summarize,
} from "./index";

const fails = (node: unknown, code: string, options?: DeserializeOptions) => {
  try {
    Q.deserialize(
      typeof node === "string" ? node : JSON.stringify(node),
      options
    );
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(DeserializeError);
    expect((error as DeserializeError).code).toBe(code);
  }
};
const allow = {
  allowedNodes: [...schemaNodeKinds],
  allowRaw: false,
  functions: [],
  maxDepth: 0,
};
const create = () =>
  JSON.parse(
    Q.createTable("t")
      .column("c", T.decimal(10, 2), { default: L.number(1) })
      .serialize({ version: 1 })
  );
describe("Schema deserialization guard", () => {
  it.each([
    [Q.createTable("t").column("c", T.int32()), "create_table"],
    [Q.dropTable("t"), "drop_table"],
    [Q.alterTable("t").dropColumn("c"), "alter_table"],
    [Q.showSchemas(), "show_schemas"],
    [Q.showTables(), "show_tables"],
    [Q.describeTable("t"), "describe_table"],
    [Q.showColumns("t"), "show_columns"],
  ] as const)(
    "uses snake_case metadata, wire kinds and allowlists for %s",
    (node, kind) => {
      expect(node.getOperationType()).toBe(kind);
      expect(node.toJSON().type).toBe(kind);
      expect(schemaNodeKinds).toContain(kind);
      for (const compress of [false, true])
        for (const version of [undefined, 1] as const) {
          const input = node.serialize({ compress, version });
          const copy = Q.deserialize(input, { ...allow, allowedNodes: [kind] });
          expect(copy).toEqual(node);
          expect(summarize(copy).kind).toBe(kind);
          fails(input, "node_not_allowed", {
            ...allow,
            allowedNodes: [node.constructor.name],
          });
        }
    }
  );
  it("denies every DDL and introspection kind unless explicitly allowlisted, including compressed payloads", () => {
    for (const node of [
      Q.createTable("t").column("c", T.int32()),
      Q.dropTable("t"),
      Q.alterTable("t").dropColumn("c"),
      Q.showSchemas(),
      Q.showTables(),
      Q.describeTable("t"),
      Q.showColumns("t"),
    ])
      for (const compress of [false, true]) {
        const input = node.serialize({ compress });
        fails(input, "node_not_allowed");
        fails(input, "node_not_allowed", {});
        fails(input, "node_not_allowed", { allowRaw: true });
        fails(input, "node_not_allowed", { allowedNodes: [] });
        fails(input, "node_not_allowed", { allowedNodes: ["SelectQuery"] });
        expect(
          Q.deserialize(input, { allowedNodes: [node.toJSON().type] })
        ).toEqual(node);
      }
  });
  it("enforces the query-kind allowlist at every nested query edge", () => {
    const select = Q.select().from("t");
    fails(Q.delete("t").serialize(), "node_not_allowed", {
      allowedNodes: ["SelectQuery"],
    });
    fails(Q.createTableAs("a", select).serialize(), "node_not_allowed", {
      allowedNodes: ["ctas"],
    });
    fails(Q.createViewAs("a", select).serialize(), "node_not_allowed", {
      allowedNodes: ["cvas"],
    });
    fails(Q.insert("t").select(select).serialize(), "node_not_allowed", {
      allowedNodes: ["InsertMutation"],
    });
    expect(
      Q.deserialize(Q.createTableAs("a", select).serialize(), {
        allowedNodes: ["ctas", "SelectQuery"],
      }).toSQL()
    ).toContain(" AS SELECT");
    const wire = JSON.parse(Q.select().from("t").serialize());
    wire.tables[0].source = {
      type: "drop_table",
      tableName: "t",
      ifExists: false,
    };
    fails(wire, "invalid_node", { allowedNodes: ["SelectQuery", "drop_table"] });
    for (const value of ["SelectQuery", [1], null])
      fails(select.serialize(), "invalid_node", { allowedNodes: value } as any);
  });
  it("rejects unknown properties at every new wire object level and rejects raw types", () => {
    const mutations = [
      (n: any) => {
        n.raw = "DROP TABLE x";
      },
      (n: any) => {
        n.columns[0].raw = true;
      },
      (n: any) => {
        n.columns[0].dataType.raw = "INTEGER";
      },
      (n: any) => {
        n.columns[0].options.raw = "DEFAULT now()";
      },
      (n: any) => {
        n.columns[0].options.default.raw = "raw";
      },
      (n: any) => {
        n.columns[0].dataType = "INTEGER";
      },
      (n: any) => {
        n.columns[0].dataType = { kind: 'a"; DROP TABLE x;--' };
      },
      (n: any) => {
        n.columns[0].options.default = { kind: "expression", value: "now()" };
      },
    ];
    for (const mutate of mutations) {
      const node = create();
      mutate(node);
      fails(node, "invalid_node", allow);
    }
    for (const node of [
      { ...Q.dropTable("t").toJSON(), extra: 1 },
      {
        ...Q.alterTable("t").dropColumn("c").toJSON(),
        action: { kind: "dropColumn", name: "c", raw: "x" },
      },
      {
        ...Q.alterTable("t").addColumn("c", T.int32()).toJSON(),
        action: {
          kind: "addColumn",
          column: { name: "c", dataType: T.int32(), options: {}, raw: "x" },
        },
      },
      { ...Q.showSchemas().toJSON(), extra: true },
      { ...Q.showTables().toJSON(), extra: true },
      { ...Q.describeTable("t").toJSON(), extra: true },
      { ...Q.showColumns("t").toJSON(), extra: true },
    ])
      fails(node, "invalid_node", allow);
  });
  it("validates identifiers, decimals, booleans, required fields, actions and versions", () => {
    for (const mutate of [
      (n: any) => {
        n.tableName = 'a"; DROP TABLE x;--';
      },
      (n: any) => {
        n.columns[0].name = "a.b";
      },
      (n: any) => {
        n.columns[0].name = "*";
      },
      (n: any) => {
        n.columns[0].dataType.precision = 39;
      },
      (n: any) => {
        n.columns[0].dataType.scale = -1;
      },
      (n: any) => {
        n.columns[0].dataType.scale = 11;
      },
      (n: any) => {
        n.columns[0].dataType.precision = 1.5;
      },
      (n: any) => {
        n.columns[0].options.nullable = 1;
      },
      (n: any) => {
        n.columns[0].options.default = { kind: "number", value: null };
      },
      (n: any) => {
        n.columns[0].options.default = { kind: "null", value: 1 };
      },
      (n: any) => {
        n.columns[0].options.default = "!!!1";
      },
      (n: any) => {
        delete n.columns[0].options;
      },
      (n: any) => {
        delete n.ifNotExists;
      },
      (n: any) => {
        n.ifNotExists = null;
      },
      (n: any) => {
        n.columns = [];
      },
      (n: any) => {
        n.columns.push(n.columns[0]);
      },
    ]) {
      const node = create();
      mutate(node);
      fails(node, "invalid_node", allow);
    }
    for (const type of schemaNodeKinds) {
      fails({ type, v: 2 }, "unsupported_version", allow);
      fails({ type, v: "1" }, "unsupported_version", allow);
    }
    for (const node of [
      { type: "drop_table", tableName: "t", ifExists: 1 },
      {
        type: "alter_table",
        tableName: "t",
        ifExists: false,
        action: { kind: "alterColumnType", name: "c", dataType: T.int32() },
      },
      {
        type: "alter_table",
        tableName: "t",
        ifExists: false,
        action: { kind: "renameColumn", name: "c", newName: "*" },
      },
      { type: "alter_table", tableName: "t", ifExists: false },
      { type: "show_tables", schema: "a.b" },
      { type: "describe_table", tableName: "*" },
      { type: "show_columns" },
    ])
      fails(node, "invalid_node", allow);
  });
  it("validates direct fromJSON entry points as well as Q.deserialize", () => {
    expect(() => CreateTable.fromJSON({ ...create(), unknown: true })).toThrow(
      DeserializeError
    );
    expect(() =>
      AlterTable.fromJSON({
        type: "alter_table",
        tableName: "t",
        ifExists: false,
        action: { kind: "raw", sql: "x" },
      })
    ).toThrow(DeserializeError);
    expect(() =>
      ShowTables.fromJSON({ type: "show_tables", schema: "*" })
    ).toThrow(DeserializeError);
  });
  it("preserves legacy CTAS/CVAS bytes, permissive defaults and guard semantics", () => {
    const select = Q.select()
      .from("t")
      .where(Cond.equal("c", Q.raw("now()")));
    for (const node of [
      Q.createTableAs("a", select),
      Q.createViewAs("a", select),
    ]) {
      expect(node.serialize()).toBe(JSON.stringify(node.toJSON()));
      expect(Q.deserialize(node.serialize()).serialize()).toBe(
        node.serialize()
      );
      fails(node.serialize(), "raw_not_allowed", { allowRaw: false });
      fails(node.serialize(), "max_depth_exceeded", { maxDepth: 0 });
    }
    fails(Q.select().field(Fn.count("c")).serialize(), "function_not_allowed", {
      allowedNodes: ["SelectQuery"],
      functions: [],
    });
    expect(
      Q.deserialize(Q.select().field(Q.raw("now()")).serialize()).toSQL()
    ).toContain("now()");
  });
});
