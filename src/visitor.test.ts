import { Q, Cond, Fn, walk, summarize, QueryVisitor, SelectQuery, MetadataOperationType } from "./index";

describe("AST visitor", () => {
  it("visits fields, aliases, tables, joins, conditions, grouping, HAVING, ordering and unions in AST order", () => {
    const query = Q.select().field(Fn.sum("u.price")).from("users", "u")
      .join(Q.table("orders", "o"), Cond.columnEqual("u.id", "o.user_id"))
      .where(Cond.not(Cond.and([Cond.between("u.age", [18, 65]), Cond.in("u.id", Q.select().field("user_id").from("memberships").where(Cond.equal("active", 1)))])))
      .groupBy("u.id").having(Cond.greaterThan(Fn.count("o.id"), 1)).orderBy("u.name")
      .union(Q.select().from("archived_users"));
    const events: any[] = [];
    const visitor: QueryVisitor = {
      onTable: (name, alias, depth) => events.push(["table", name, alias, depth]),
      onColumn: (table, name) => events.push(["column", table, name]),
      onFunction: name => events.push(["function", name]),
      onSubquery: depth => events.push(["subquery", depth]),
      onUnion: () => events.push(["union"]),
    };
    const before = query.serialize();
    walk(query, visitor);
    expect(query.serialize()).toBe(before);
    expect(events).toEqual([
      ["function", "SUM"], ["column", "u", "price"], ["table", "users", "u", 0],
      ["table", "orders", "o", 0], ["column", "u", "id"], ["column", "o", "user_id"],
      ["column", "u", "age"], ["column", "u", "id"], ["subquery", 1],
      ["column", undefined, "user_id"], ["table", "memberships", undefined, 1], ["column", undefined, "active"],
      ["column", "u", "id"], ["function", "COUNT"], ["column", "o", "id"], ["column", "u", "name"],
      ["union"], ["subquery", 1], ["table", "archived_users", undefined, 1],
    ]);
  });
  it("summarizes stable deduplicated names, qualified columns and maximum depth", () => {
    const query = Q.select().field("u.id").field(Fn.sum("u.id")).from("users", "u")
      .where(Cond.equal("u.id", "not_a_column"))
      .union(Q.select().from(Q.select().from("users")));
    expect(summarize(query)).toEqual({ tables: ["users"], columns: [{ table: "u", name: "id" }], functions: ["SUM"], maxDepth: 2, hasRaw: false, hasUnion: true, kind: "select" });
  });
  it("visits NOT IN subqueries and derived JOIN tables", () => {
    const query = Q.select().from("users").join(Q.table(Q.select().from("orders")))
      .where(Cond.notIn("id", Q.select().from("banned")));
    expect(summarize(query).tables).toEqual(["users", "orders", "banned"]);
    expect(summarize(query).maxDepth).toBe(1);
  });
  it("visits nested conditions and operations inside function arguments", () => {
    const query = Q.select().field(Fn.if(Cond.equal("active", true), Fn.add("price", Fn.sum("tax")), Q.value("COUNT(secret)")));
    expect(summarize(query)).toMatchObject({ columns: [{ table: undefined, name: "active" }, { table: undefined, name: "price" }, { table: undefined, name: "tax" }], functions: ["IF", "SUM"], hasRaw: false });
  });
  it("finds raw nodes and legacy SQL expressions without interpreting literal strings", () => {
    const query = Q.select().field(Q.raw("NOW()")).field("COUNT(id)").field(Q.value("literal !!raw!!"));
    const onRaw = jest.fn();
    walk(query, { onRaw });
    expect(onRaw).toHaveBeenCalledTimes(2);
    expect(summarize(query).hasRaw).toBe(true);
  });
  it("visits INSERT SELECT, UPDATE scalar subqueries and DELETE conditions", () => {
    const select = Q.select().field(Fn.count("id")).from("orders");
    const insert = Q.insert("archive").select(select, ["count"]);
    const update = Q.update("users").set({ total: select, name: "literal", tax: Fn.add("tax", Q.value(1)) }).where(Cond.like("name", "foo"));
    const deletion = Q.delete("users").where(Cond.in("id", Q.select().from("banned")));
    for (const [query, kind] of [[insert, "insert"], [update, "update"], [deletion, "delete"]] as const) {
      const onMutation = jest.fn(); walk(query, { onMutation });
      expect(onMutation).toHaveBeenCalledWith(kind);
      expect(summarize(query).kind).toBe(kind);
      expect(summarize(query).maxDepth).toBe(1);
    }
    expect(summarize(update).tables).toEqual(["users", "orders"]);
    expect(summarize(update).functions).toEqual(["COUNT"]);
  });
  it("treats INSERT row values as literal data and visits target columns", () => {
    expect(summarize(Q.insert("users").values([{ name: "FN(\"secret\")", value: "!!raw!!" }]))).toMatchObject({ tables: ["users"], columns: [{ name: "name" }, { name: "value" }], functions: [], hasRaw: false, kind: "insert" });
  });
  it("visits schema wrappers and handles nested queries with no tables", () => {
    expect(summarize(Q.createTableAs("archive", Q.select().union(Q.select())))).toMatchObject({ tables: ["archive"], maxDepth: 2, kind: MetadataOperationType.CREATE_TABLE_AS });
    expect(summarize(Q.createViewAs("view", Q.select().from("users")))).toMatchObject({ tables: ["view", "users"], maxDepth: 1, kind: MetadataOperationType.CREATE_VIEW_AS });
  });
  it("allows empty visitors and propagates caller rejection", () => {
    walk(Q.select(), {});
    expect(() => walk(Q.select().from("forbidden"), { onTable: () => { throw new Error("denied"); } })).toThrow("denied");
  });
  it("guards, walks, transforms and parameterizes a complete untrusted query", () => {
    const payload = Q.select().field(Fn.count("u.id"), "count").from("users", "u").where(Cond.equal("u.active", true)).serialize({ version: 1 });
    const query = Q.deserialize(payload, { allowRaw: false, functions: ["COUNT"], maxDepth: 2 });
    if (!(query instanceof SelectQuery)) throw new Error("Expected SELECT");
    walk(query, { onTable: name => { if (name !== "users") throw new Error("denied"); } });
    expect(query.toSQLWithBindings(Q.flavors.sqlite, {
      transformTable: name => Q.select().from(name).where(Cond.equal("tenant_id", "t1")),
    })).toEqual({ sql: "SELECT COUNT(`u`.`id`) AS `count` FROM (SELECT * FROM `users` WHERE `tenant_id` = ?) AS `u` WHERE `u`.`active` = ?", bindings: ["t1", true] });
  });
});
