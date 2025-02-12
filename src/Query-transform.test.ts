import { Cond } from "./Condition";
import { Q, Query } from "./Query";

const flavor = Q.flavors.mysql;

describe("Query transformations", () => {
  it("should transform select query", () => {
    const query = Query.select().from("foo").union(Q.select().from("blah"));
    const sql = query.toSQL(flavor, {
      transformSelectQuery: (select) => {
        return select.addField("f1.name", "f1name");
      },
    });
    expect(sql).toEqual(
      "(SELECT `f1`.`name` AS `f1name` FROM `foo`) UNION (SELECT `f1`.`name` AS `f1name` FROM `blah`)"
    );
  });
  it("should transform foo query table", () => {
    const query = Query.select()
      .from("foo", "f1")
      .leftJoin(Q.table("foo2", "f2"), Cond.columnEqual("f1.id", "f2.id"));
    const sql = query.toSQL(flavor, {
      transformTable: (table) => {
        if (table !== "foo") {
          return table;
        }
        return Q.select()
          .from(table)
          .join(Q.table("bar", "b"), Cond.columnEqual("f.id", "b.id"));
      },
    });
    expect(sql).toEqual(
      "SELECT * FROM (SELECT * FROM `foo` INNER JOIN `bar` AS `b` ON `f`.`id` = `b`.`id`) AS `f1` LEFT JOIN `foo2` AS `f2` ON `f1`.`id` = `f2`.`id`"
    );
  });
  it("should transform table with subquery with proper alias", () => {
    const query = Query.select().from("foo");
    const query2 = Query.select().from("foo", "f");
    const sql = query.toSQL(flavor, {
      transformTable: (table) => {
        return Q.select().from(table).where(Cond.equal("foo", "bar"));
      },
    });
    const sql2 = query2.toSQL(flavor, {
      transformTable: (table) => {
        return Q.select().from(table).where(Cond.equal("foo", "bar"));
      },
    });
    expect(sql).toEqual(
      'SELECT * FROM (SELECT * FROM `foo` WHERE `foo` = "bar") AS `t`'
    );
    expect(sql2).toEqual(
      'SELECT * FROM (SELECT * FROM `foo` WHERE `foo` = "bar") AS `f`'
    );
  });
  it("should transform nested query table", () => {
    const query = Query.select().from(Q.select().from("world"), "f1");
    const sql = query.toSQL(flavor, {
      transformTable: (table) => {
        if (table === "world") {
          return "hello_" + table;
        }
        return table;
      },
    });
    expect(sql).toEqual("SELECT * FROM (SELECT * FROM `hello_world`) AS `f1`");
  });
  it("should transform foo query table and select query", () => {
    const query = Query.select()
      .from("foo", "f1")
      .leftJoin(Q.table("foo2", "f2"), Cond.columnEqual("f1.id", "f2.id"));
    const sql = query.toSQL(flavor, {
      transformTable: (table) => {
        if (table !== "foo") {
          return table;
        }
        return Q.select()
          .from(table)
          .join(Q.table("bar", "b"), Cond.columnEqual("f.id", "b.id"));
      },
      transformSelectQuery: (select) => {
        return select.addField("f1.name", "f1name");
      },
    });
    expect(sql).toEqual(
      "SELECT `f1`.`name` AS `f1name` FROM (SELECT `f1`.`name` AS `f1name` FROM `foo` INNER JOIN `bar` AS `b` ON `f`.`id` = `b`.`id`) AS `f1` LEFT JOIN `foo2` AS `f2` ON `f1`.`id` = `f2`.`id`"
    );
  });

  it("should transform insert", () => {
    const query = Query.insert("foo").values([{ id: 1, name: "foo" }]);
    const sql = query.toSQL(flavor, {
      transformInsertMutation: (q) => {
        const values = q
          .allValues()
          .map((v) => ({ ...v, createdAt: "YYYY-MM-DD" }));
        return q.removeAllValues().values(values);
      },
    });
    expect(sql).toEqual(
      'INSERT INTO `foo` (`id`, `name`, `createdAt`) VALUES (1, "foo", "YYYY-MM-DD")'
    );
  });

  it("should transform update", () => {
    const query = Query.update("foo").set({ firstName: "john" });
    const sql = query.toSQL(flavor, {
      transformUpdateMutation: (q) => {
        return q
          .set({ firstName: "jane" })
          .where(Cond.equal("lastName", "doe"));
      },
    });
    expect(sql).toEqual(
      'UPDATE `foo` SET `firstName` = "jane" WHERE `lastName` = "doe"'
    );
  });

  it("should transform delete", () => {
    const query = Query.delete("foo");
    const sql = query.toSQL(flavor, {
      transformDeleteMutation: (q) => {
        return q.where(Cond.equal("owner", "12345"));
      },
    });
    expect(sql).toEqual('DELETE FROM `foo` WHERE `owner` = "12345"');
  });
});
