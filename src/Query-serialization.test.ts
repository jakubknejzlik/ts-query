import { Conditions } from "./Condition";
import { Q } from "./Query";

describe("Query builder JSON Serialization/Deserialization", () => {
  // Round-trip Serialization and Deserialization
  it("should handle round-trip JSON serialization and deserialization for a basic query", () => {
    const originalQuery = Q.select()
      .from("table")
      .where(Conditions.equal("foo", 123));
    const jsonStr = originalQuery.serialize();
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  // Multiple Serialization and Deserialization
  it("should handle multiple JSON serialization and deserialization for a basic query", () => {
    const originalQuery = Q.select()
      .from("table")
      .where(Conditions.equal("foo", 123));
    const jsonStr = originalQuery.serialize();
    const jsonStr2 = Q.deserialize(jsonStr).serialize();
    const deserializedQuery = Q.deserialize(jsonStr2);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  // Round-trip Serialization and Deserialization for Complex Query
  it("should handle round-trip JSON serialization and deserialization for a complex query", () => {
    const originalQuery = Q.select()
      .from("table")
      .addField("foo")
      .addField("bar", "aliasBar")
      .where(Conditions.equal("foo", 123))
      .orderBy("bar", "DESC")
      .limit(10)
      .offset(5);
    const jsonStr = originalQuery.serialize();
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  // Round-trip Serialization and Deserialization for Group By and Having
  it("should handle round-trip JSON serialization and deserialization for group by and having", () => {
    const originalQuery = Q.select()
      .from("table")
      .groupBy("foo")
      .having(Conditions.greaterThan("bar", 50));
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
  it("should handle round-trip JSON serialization and deserialization for JOINS", () => {
    const originalQuery = Q.select()
      .from("table")
      .join(
        Q.table("otherTable", "T2"),
        Conditions.columnEqual("table.foo", "otherTable.bar")
      )
      .leftJoin(
        Q.table("anotherTable", "AAA"),
        Conditions.columnEqual("table.foo", "anotherTable.bar")
      );
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
  it("should handle round-trip JSON serialization and deserialization stats query", () => {
    const originalQuery = Q.stats().addField(
      "SUM(price_without_charges)",
      "price_without_charges"
    );
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
  it("should handle round-trip JSON serialization and deserialization of subquery", () => {
    const originalQuery = Q.select()
      .from(Q.select().from("table"))
      .join(
        Q.table("otherTable", "T2"),
        Conditions.columnEqual("table.foo", "otherTable.bar")
      )
      .leftJoin(
        Q.table("anotherTable", "AAA"),
        Conditions.columnEqual("table.foo", "anotherTable.bar")
      );
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
});
