import { Cond } from "./Condition";
import { Fn } from "./Function";
import { Q, Query, UnionType } from "./Query";

const flavor = Q.flavors.mysql;

describe("Query builder SQL", () => {
  // Basic Select Queries
  it("should create basic select query", () => {
    expect(Query.select().from("foo").toSQL(flavor)).toEqual(
      "SELECT * FROM `foo`"
    );
    expect(
      Query.select()
        .from("table")
        .addField("foo")
        .addField(Fn.max("foo"), "fooMax")
        .addField("MAX(foo)", "fooMax2")
        .addField(Q.null(), "nullValue")
        .toSQL(flavor)
    ).toEqual(
      "SELECT `foo`, MAX(`foo`) AS `fooMax`, MAX(foo) AS `fooMax2`, NULL AS `nullValue` FROM `table`"
    );
    expect(
      Query.select().from("table").addField("foo", "blah").toSQL(flavor)
    ).toEqual("SELECT `foo` AS `blah` FROM `table`");
    expect(
      Query.select()
        .from("table")
        .fields([{ name: "foo", alias: "blah" }])
        .addField("foo2", "blah2")
        .toSQL(flavor)
    ).toEqual("SELECT `foo` AS `blah`, `foo2` AS `blah2` FROM `table`");
  });

  // WHERE Conditions
  it("should handle WHERE conditions", () => {
    expect(
      Query.select().from("table").where(Cond.equal("foo", 123)).toSQL(flavor)
    ).toEqual("SELECT * FROM `table` WHERE `foo` = 123");
    expect(
      Query.select()
        .from("table")
        .where(Cond.equal("SUM(foo)", 123))
        .toSQL(flavor)
    ).toEqual("SELECT * FROM `table` WHERE SUM(foo) = 123");
    expect(
      Query.select()
        .from("table")
        .where(Cond.equal(Fn.sum("foo"), 123))
        .toSQL(flavor)
    ).toEqual("SELECT * FROM `table` WHERE SUM(`foo`) = 123");
    expect(
      Query.select()
        .from("table")
        .where(Cond.lessThan("bar", "abc"))
        .toSQL(flavor)
    ).toEqual('SELECT * FROM `table` WHERE `bar` < "abc"');
  });
  // WHERE Conditions optional
  it("should handle optional WHERE condition", () => {
    expect(Query.select().from("table").where(null).toSQL(flavor)).toEqual(
      "SELECT * FROM `table`"
    );
    expect(
      Query.select()
        .from("table")
        .where(null)
        .where(Cond.equal("foo", "blah"))
        .toSQL(flavor)
    ).toEqual('SELECT * FROM `table` WHERE `foo` = "blah"');
    expect(
      Query.select().from("table").where(Cond.and([])).toSQL(flavor)
    ).toEqual("SELECT * FROM `table`");
    expect(
      Query.select().from("table").where(Cond.or([])).toSQL(flavor)
    ).toEqual("SELECT * FROM `table`");
  });

  // LIMIT and OFFSET
  it("should handle LIMIT and OFFSET", () => {
    expect(Query.select().from("table").limit(10).toSQL(flavor)).toEqual(
      "SELECT * FROM `table` LIMIT 10"
    );
    expect(Query.select().from("table").offset(5).toSQL(flavor)).toEqual(
      "SELECT * FROM `table` OFFSET 5"
    );
    expect(
      Query.select().from("table").limit(10).offset(5).toSQL(flavor)
    ).toEqual("SELECT * FROM `table` LIMIT 10 OFFSET 5");
  });

  // ORDER BY
  it("should handle ORDER BY", () => {
    expect(Query.select().from("table").orderBy("foo").toSQL(flavor)).toEqual(
      "SELECT * FROM `table` ORDER BY `foo` ASC"
    );
    expect(
      Query.select().from("table").orderBy("foo", "DESC").toSQL(flavor)
    ).toEqual("SELECT * FROM `table` ORDER BY `foo` DESC");
    expect(
      Query.select().from("table").orderBy("SUM(foo)", "DESC").toSQL(flavor)
    ).toEqual("SELECT * FROM `table` ORDER BY SUM(foo) DESC");
    expect(
      Query.select().from("table").orderBy(Fn.sum("foo"), "DESC").toSQL(flavor)
    ).toEqual("SELECT * FROM `table` ORDER BY SUM(`foo`) DESC");
  });

  // GROUP BY
  it("should handle GROUP BY", () => {
    expect(Query.select().from("table").groupBy("foo").toSQL(flavor)).toEqual(
      "SELECT * FROM `table` GROUP BY `foo`"
    );
    expect(
      Query.select().from("table").groupBy("YEAR(foo)").toSQL(flavor)
    ).toEqual("SELECT * FROM `table` GROUP BY YEAR(foo)");
    expect(
      Query.select().from("table").groupBy(Fn.year("foo")).toSQL(flavor)
    ).toEqual("SELECT * FROM `table` GROUP BY YEAR(`foo`)");
  });

  // Complex Queries
  it("should handle complex queries", () => {
    expect(
      Query.select()
        .from("table")
        .addField("foo")
        .addField("bar", "aliasBar")
        .where(Cond.equal("foo", 123))
        .orderBy("bar", "DESC")
        .limit(10)
        .offset(5)
        .toSQL(flavor)
    ).toEqual(
      "SELECT `foo`, `bar` AS `aliasBar` FROM `table` WHERE `foo` = 123 ORDER BY `bar` DESC LIMIT 10 OFFSET 5"
    );
  });
  it("should handle complex queries immutability", () => {
    const q = Query.select()
      .from("table")
      .addField("foo")
      .addField("bar", "aliasBar")
      .where(Cond.equal("foo", 123))
      .orderBy("bar", "DESC")
      .limit(10)
      .offset(5);
    const q2 = q.orderBy("foo");

    expect(q === q2).toBeFalsy();
    expect(q.toSQL(flavor)).toEqual(
      "SELECT `foo`, `bar` AS `aliasBar` FROM `table` WHERE `foo` = 123 ORDER BY `bar` DESC LIMIT 10 OFFSET 5"
    );
    expect(q2.toSQL(flavor)).toEqual(
      "SELECT `foo`, `bar` AS `aliasBar` FROM `table` WHERE `foo` = 123 ORDER BY `bar` DESC, `foo` ASC LIMIT 10 OFFSET 5"
    );
  });

  // JOIN
  it("should handle JOIN", () => {
    expect(
      Query.select()
        .from("table", "T1")
        .join(Q.table("otherTable", "T2"), Cond.columnEqual("T1.foo", "T2.bar"))
        .toSQL(flavor)
    ).toEqual(
      "SELECT * FROM `table` AS `T1` INNER JOIN `otherTable` AS `T2` ON `T1`.`foo` = `T2`.`bar`"
    );
  });
  it("should handle LEFT JOIN", () => {
    expect(
      Query.select()
        .from("table")
        .leftJoin(
          Q.table("otherTable", "aliasOtherTable"),
          Cond.columnEqual("table.foo", "aliasOtherTable.bar")
        )
        .toSQL(flavor)
    ).toEqual(
      "SELECT * FROM `table` LEFT JOIN `otherTable` AS `aliasOtherTable` ON `table`.`foo` = `aliasOtherTable`.`bar`"
    );
  });
  it("should handle FULL JOIN", () => {
    expect(
      Query.select()
        .from("table")
        .fullJoin(
          Q.table("otherTable", "aliasOtherTable"),
          Cond.columnEqual("table.foo", "aliasOtherTable.bar")
        )
        .toSQL(flavor)
    ).toEqual(
      "SELECT * FROM `table` FULL JOIN `otherTable` AS `aliasOtherTable` ON `table`.`foo` = `aliasOtherTable`.`bar`"
    );
  });
  it("should handle CROSS JOIN", () => {
    expect(
      Query.select()
        .from("table")
        .crossJoin(
          Q.table("otherTable", "aliasOtherTable"),
          Cond.columnEqual("table.foo", "aliasOtherTable.bar")
        )
        .toSQL(flavor)
    ).toEqual(
      "SELECT * FROM `table` CROSS JOIN `otherTable` AS `aliasOtherTable` ON `table`.`foo` = `aliasOtherTable`.`bar`"
    );
  });
  it("should handle multiple JOINS", () => {
    expect(
      Query.select()
        .from("table")
        .join(
          Q.table("otherTable", "T2"),
          Cond.columnEqual("table.foo", "otherTable.bar")
        )
        .leftJoin(
          Q.table("anotherTable", "AAA"),
          Cond.columnEqual("table.foo", "anotherTable.bar")
        )
        .toSQL(flavor)
    ).toEqual(
      "SELECT * FROM `table` INNER JOIN `otherTable` AS `T2` ON `table`.`foo` = `otherTable`.`bar` LEFT JOIN `anotherTable` AS `AAA` ON `table`.`foo` = `anotherTable`.`bar`"
    );
  });

  // SUBQUERY
  it("should handle subqueries", () => {
    expect(
      Query.select()
        .from(Query.select().from("table"))
        .join(
          Q.table("otherTable", "T2"),
          Cond.columnEqual("table.foo", "otherTable.bar")
        )
        .leftJoin(
          Q.table("anotherTable", "AAA"),
          Cond.columnEqual("table.foo", "anotherTable.bar")
        )
        .toSQL(flavor)
    ).toEqual(
      "SELECT * FROM (SELECT * FROM `table`) AS `t` INNER JOIN `otherTable` AS `T2` ON `table`.`foo` = `otherTable`.`bar` LEFT JOIN `anotherTable` AS `AAA` ON `table`.`foo` = `anotherTable`.`bar`"
    );
  });
});

describe("Query builder SQL with UNION", () => {
  // Basic UNION
  it("should handle basic UNION", () => {
    const query1 = Query.select().from("table1").addField("foo");
    const query2 = Query.select().from("table2").addField("bar");
    expect(query1.union(query2).toSQL(flavor)).toEqual(
      "(SELECT `foo` FROM `table1`) UNION (SELECT `bar` FROM `table2`)"
    );
  });

  // UNION with WHERE conditions
  it("should handle UNION with WHERE conditions", () => {
    const query1 = Query.select().from("table1").where(Cond.equal("foo", 1));
    const query2 = Query.select().from("table2").where(Cond.equal("bar", 2));
    expect(query1.union(query2).toSQL(flavor)).toEqual(
      "(SELECT * FROM `table1` WHERE `foo` = 1) UNION (SELECT * FROM `table2` WHERE `bar` = 2)"
    );
  });

  // UNION ALL
  it("should handle UNION ALL", () => {
    const query1 = Query.select().from("table1").addField("foo");
    const query2 = Query.select().from("table2").addField("bar");
    expect(query1.union(query2, UnionType.UNION_ALL).toSQL(flavor)).toEqual(
      "(SELECT `foo` FROM `table1`) UNION ALL (SELECT `bar` FROM `table2`)"
    );
  });

  // Chained UNIONs
  it("should handle chained UNIONs", () => {
    const query1 = Query.select().from("table1").addField("foo");
    const query2 = Query.select().from("table2").addField("bar");
    const query3 = Query.select().from("table3").addField("baz");
    expect(query1.union(query2).union(query3).toSQL(flavor)).toEqual(
      "((SELECT `foo` FROM `table1`) UNION (SELECT `bar` FROM `table2`)) UNION (SELECT `baz` FROM `table3`)"
    );
  });

  // UNION with complex queries
  it("should handle UNION with complex queries", () => {
    const query1 = Query.select()
      .from("table1")
      .addField("foo")
      .where(Cond.equal("foo", 123))
      .orderBy("foo", "DESC")
      .limit(10);
    const query2 = Query.select()
      .from("table2")
      .addField("bar")
      .where(Cond.equal("bar", 456))
      .orderBy("bar", "ASC")
      .limit(5);
    expect(query1.union(query2).toSQL(flavor)).toEqual(
      "(SELECT `foo` FROM `table1` WHERE `foo` = 123 ORDER BY `foo` DESC LIMIT 10) UNION (SELECT `bar` FROM `table2` WHERE `bar` = 456 ORDER BY `bar` ASC LIMIT 5)"
    );
  });

  // UNION with alias
  it("should handle UNION with table alias", () => {
    const query1 = Query.select().from("table1", "T1").addField("T1.foo");
    const query2 = Query.select().from("table2", "T2").addField("T2.bar");
    expect(query1.union(query2).toSQL(flavor)).toEqual(
      "(SELECT `T1`.`foo` FROM `table1` AS `T1`) UNION (SELECT `T2`.`bar` FROM `table2` AS `T2`)"
    );
  });

  // UNION serialization
  it("should handle UNION with table alias", () => {
    const query1 = Query.select().from("table1", "T1").addField("T1.foo");
    const query2 = Query.select().from("table2", "T2").addField("T2.bar");
    const q = query1.union(query2);
    const ser = q.serialize();
    const q2 = Q.deserialize(ser);
    expect(q.toSQL(flavor)).toEqual(q2.toSQL(flavor));
  });
});

describe("Query builder Serialization with UNION", () => {
  // Serialization of basic UNION
  it("should serialize and deserialize basic UNION", () => {
    const query1 = Query.select().from("table1").addField("foo");
    const query2 = Query.select().from("table2").addField("bar");
    const unionQuery = query1.union(query2);

    const serialized = unionQuery.serialize();
    const deserialized = Q.deserialize(serialized);

    expect(deserialized.toSQL(flavor)).toEqual(unionQuery.toSQL(flavor));
  });

  // Serialization of UNION ALL
  it("should serialize and deserialize UNION ALL", () => {
    const query1 = Query.select().from("table1").addField("foo");
    const query2 = Query.select().from("table2").addField("bar");
    const unionAllQuery = query1.union(query2, UnionType.UNION_ALL);

    const serialized = unionAllQuery.serialize();
    const deserialized = Q.deserialize(serialized);

    expect(deserialized.toSQL(flavor)).toEqual(unionAllQuery.toSQL(flavor));
  });

  // Serialization of complex UNION queries
  it("should serialize and deserialize complex UNION queries", () => {
    const query1 = Query.select()
      .from("table1")
      .addField("foo")
      .where(Cond.equal("foo", 1));
    const query2 = Query.select()
      .from("table2")
      .addField("bar")
      .where(Cond.equal("bar", 2));
    const complexUnionQuery = query1.union(query2);

    const serialized = complexUnionQuery.serialize();
    const deserialized = Q.deserialize(serialized);

    expect(deserialized.toSQL(flavor)).toEqual(complexUnionQuery.toSQL(flavor));
  });

  // Serialization of chained UNIONs
  it("should serialize and deserialize chained UNIONs", () => {
    const query1 = Query.select().from("table1").addField("foo");
    const query2 = Query.select().from("table2").addField("bar");
    const query3 = Query.select().from("table3").addField("baz");
    const chainedUnionQuery = query1.union(query2).union(query3);

    const serialized = chainedUnionQuery.serialize();
    const deserialized = Q.deserialize(serialized);

    expect(deserialized.toSQL(flavor)).toEqual(chainedUnionQuery.toSQL(flavor));
  });
});
