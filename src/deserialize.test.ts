import {
  Q,
  Cond,
  Fn,
  DeserializeError,
  DeserializeErrorCode,
  DeserializeOptions,
} from "./index";
import { FunctionExpression, OperationExpression } from "./Expression";

const checked = (
  query: { serialize(): string },
  options: DeserializeOptions = { allowRaw: false }
) => Q.deserialize(query.serialize(), options);
const fails = (
  input: string,
  code: DeserializeErrorCode,
  options: DeserializeOptions = { allowRaw: false }
) => {
  try {
    Q.deserialize(input, options);
    throw new Error("Expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(DeserializeError);
    expect((error as DeserializeError).code).toBe(code);
  }
};

describe("Guarded deserialization", () => {
  it("accepts typed functions and literal data with a case-insensitive allowlist", () => {
    const query = Q.select()
      .field(Fn.count("u.id"))
      .from("users", "u")
      .where(Cond.equal("name", 'FN(["evil"]) !!raw!!'));
    expect(
      checked(query, {
        allowRaw: false,
        functions: ["count"],
        maxDepth: 0,
      }).toSQL()
    ).toBe(query.toSQL());
  });
  it("preserves permissive legacy behavior when options are omitted", () => {
    const query = Q.select()
      .field(Q.raw("NOW()"))
      .field(new FunctionExpression("custom", "id"))
      .from("users");
    expect(Q.deserialize(query.serialize()).toSQL()).toBe(query.toSQL());
  });
  it.each([
    Q.select().field(Q.raw("NOW()")),
    Q.select().where(Cond.equal("id", Q.raw("1"))),
    Q.select().where(Cond.in("id", [Q.raw("NOW()")])),
    Q.select().from(Q.select().field(Q.raw("NOW()"))),
    Q.select().union(Q.select().field(Q.raw("NOW()"))),
    Q.select().field(Fn.sum(Q.raw("price"))),
    Q.select().join(Q.table("b"), Cond.equal("x", Q.raw("1"))),
    Q.update("users").set({ x: Q.raw("NOW()") }),
    Q.delete("users").where(Cond.equal("x", Q.raw("1"))),
    Q.insert("users").select(Q.select().field(Q.raw("NOW()"))),
    Q.select().field("COUNT(id)"),
    Q.select().where(Cond.equal("COUNT(id)", 1)),
  ])("rejects raw SQL at every executable location (%#)", (query) =>
    fails(query.serialize(), "raw_not_allowed")
  );
  it("does not interpret INSERT string values or LIKE patterns as encoded expressions", () => {
    expect(
      checked(Q.insert("users").values([{ text: '!!"NOW()"!!' }])).toSQL()
    ).toContain("NOW()");
    expect(
      checked(Q.select().where(Cond.like("name", 'FN(["evil"])')), {
        allowRaw: false,
        functions: [],
      }).toSQL()
    ).toContain("evil");
  });
  it.each([
    Q.select().field(Fn.sum(Fn.count("id"))),
    Q.select().from(Q.select().field(Fn.count("id"))),
    Q.select().having(Cond.greaterThan(Fn.count("id"), 1)),
    Q.select().orderBy(Fn.count("id")),
    Q.select().groupBy(Fn.count("id")),
    Q.select().field(
      Fn.if(Cond.greaterThan(Fn.count("id"), 1), Q.value(1), Q.value(0))
    ),
    Q.update("users").set({ x: Fn.count("id") }),
    Q.insert("users").select(Q.select().field(Fn.count("id"))),
    Q.select().union(Q.select().field(Fn.count("id"))),
  ])("enforces the function allowlist throughout the tree (%#)", (query) =>
    fails(query.serialize(), "function_not_allowed", {
      functions: ["SUM", "IF"],
    })
  );
  it("distinguishes omitted and empty function allowlists", () => {
    const query = Q.select().field(Fn.count("id"));
    expect(checked(query).toSQL()).toContain("COUNT");
    fails(query.serialize(), "function_not_allowed", { functions: [] });
  });
  it.each([
    Q.select().from(Q.select().from("users")),
    Q.select().union(Q.select()),
    Q.select().where(Cond.in("id", Q.select().from("users"))),
    Q.select().join(Q.table(Q.select().from("users"))),
    Q.update("users").set({ id: Q.select().from("users") }),
    Q.insert("users").select(Q.select().from("users")),
    Q.createTableAs("archive", Q.select().from("users")),
    Q.createViewAs("view", Q.select().from("users")),
  ])("counts every nested query edge from root depth zero (%#)", (query) => {
    fails(query.serialize(), "max_depth_exceeded", { maxDepth: 0 });
    expect(checked(query, { maxDepth: 1 }).toSQL()).toBe(query.toSQL());
  });
  it("counts nested unions and subqueries together", () => {
    const query = Q.select().from(Q.select().union(Q.select().from("users")));
    fails(query.serialize(), "max_depth_exceeded", { maxDepth: 1 });
    expect(checked(query, { maxDepth: 2 }).toSQL()).toBe(query.toSQL());
  });
  it.each([
    null,
    [],
    {},
    { type: "unknown" },
    { type: "SelectQuery", tables: [], fields: [{ name: null }] },
    {
      type: "SelectQuery",
      tables: [
        {
          type: "Table",
          source: {
            type: "DeleteMutation",
            table: { type: "Table", source: "users" },
            where: [],
          },
        },
      ],
    },
    {
      type: "DeleteMutation",
      table: { type: "Table", source: { type: "SelectQuery", tables: [] } },
      where: [],
    },
    { type: "SelectQuery", tables: "users" },
    { type: "SelectQuery", tables: [], where: [{ type: "NoCondition" }] },
    { type: "SelectQuery", tables: [], fields: [{ name: 'FN(["SUM",)' }] },
    { type: "SelectQuery", tables: [], fields: [{ name: "!!!{}" }] },
    { type: "SelectQuery", tables: [], fields: [{ name: "!D!NaN!!" }] },
    { type: "SelectQuery", tables: [], limit: "1; DROP TABLE users" },
    {
      type: "SelectQuery",
      tables: [],
      fields: [{ name: 'OP(["; DROP TABLE users", "id"])' }],
    },
    {
      type: "SelectQuery",
      tables: [],
      fields: [{ name: 'FN(["COUNT); DROP TABLE users; --", "id"])' }],
    },
    {
      type: "SelectQuery",
      tables: [{ type: "Table", source: "u` WHERE 1=1 --" }],
    },
    {
      type: "SelectQuery",
      tables: [],
      where: [
        {
          type: "BinaryCondition",
          key: "id",
          value: "!!!1",
          operator: "= 1 OR 1=",
        },
      ],
    },
    {
      type: "InsertMutation",
      table: { type: "Table", source: "u" },
      values: [{ x: { type: "RawExpression", value: "NOW()" } }],
    },
    {
      type: "UpdateMutation",
      table: { type: "Table", source: "u" },
      values: { x: 1 },
      where: [],
    },
  ])("rejects malformed nodes with a typed error (%#)", (node) =>
    fails(JSON.stringify(node), "invalid_node")
  );
  it.each([-1, 1.5, NaN, Infinity])("rejects invalid maxDepth %s", (maxDepth) =>
    fails(Q.select().serialize(), "invalid_node", { maxDepth })
  );
  it("returns a typed error for invalid JSON and compressed data", () => {
    fails("{bad", "invalid_node");
    fails("not gzip", "invalid_node");
  });
  it("applies all guards to compressed payloads", () => {
    fails(
      Q.select().field(Q.raw("NOW()")).serialize({ compress: true }),
      "raw_not_allowed"
    );
    fails(
      Q.select().field(Fn.count("id")).serialize({ compress: true }),
      "function_not_allowed",
      { functions: [] }
    );
  });
  it("accepts encoded strings, dates, arithmetic, NOT/BETWEEN/IN/NULL/LIKE and column comparisons", () => {
    const query = Q.select()
      .field(Fn.add("price", Q.value(1)))
      .field(Q.S`constant`)
      .from("users")
      .where(
        Cond.and([
          Cond.not(Cond.equal("name", "a")),
          Cond.between("age", [1, 2]),
          Cond.in("id", [1]),
          Cond.notIn("id", [2]),
          Cond.null("deleted"),
          Cond.like("name", "%a%"),
          Cond.columnEqual("a.id", "b.id"),
          Cond.equal("created", new Date("2025-01-01")),
        ])
      );
    expect(checked(query).toSQL()).toBe(query.toSQL());
  });
});

describe("Versioned serialization", () => {
  it.each([
    Q.select().from("users"),
    Q.insert("users").values([{ x: 1 }]),
    Q.update("users").set({ x: 1 }),
    Q.delete("users"),
    Q.createTableAs("archive", Q.select().from("users")),
    Q.createViewAs("view", Q.select().from("users")),
  ])(
    "preserves legacy bytes and offers an opt-in root v1 envelope (%#)",
    (query) => {
      expect(query.serialize()).toBe(JSON.stringify(query.toJSON()));
      expect(JSON.parse(query.serialize()).v).toBeUndefined();
      const serialized = query.serialize({ version: 1 });
      expect(JSON.parse(serialized).v).toBe(1);
      expect(Q.deserialize(serialized, { allowRaw: false }).toSQL()).toBe(
        query.toSQL()
      );
      expect(
        Q.deserialize(query.serialize({ version: 1, compress: true })).toSQL()
      ).toBe(query.toSQL());
    }
  );
  it.each([0, 2, "1", null])(
    "rejects unknown root version %s with and without guard options",
    (v) => {
      const serialized = JSON.stringify({ ...Q.select().toJSON(), v });
      fails(serialized, "unsupported_version");
      expect(() => Q.deserialize(serialized)).toThrow(DeserializeError);
    }
  );
  it("keeps version metadata out of nested AST nodes", () => {
    const serialized = JSON.parse(
      Q.select().from(Q.select().from("users")).serialize({ version: 1 })
    );
    expect(serialized.v).toBe(1);
    expect(serialized.tables[0].source.v).toBeUndefined();
  });
});
