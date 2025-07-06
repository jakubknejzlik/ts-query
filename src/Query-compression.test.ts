import { Conditions } from "./Condition";
import { Q } from "./Query";

describe("Query builder JSON Serialization/Deserialization with compression", () => {
  it("should handle round-trip JSON serialization and deserialization with compression for select", () => {
    const originalQuery = Q.select()
      .from("table")
      .where(Conditions.equal("foo", 123));
    const jsonStr = originalQuery.serialize({ compress: true });
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  it("should handle round-trip JSON serialization and deserialization with compression for insert", () => {
    const originalQuery = Q.insert("table").values([{ aa: "bb" }]);
    const jsonStr = originalQuery.serialize({ compress: true });
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  it("should handle round-trip JSON serialization and deserialization with compression for update", () => {
    const originalQuery = Q.update("table")
      .set({ aa: "bb" })
      .where(Conditions.equal("id", 1));
    const jsonStr = originalQuery.serialize({ compress: true });
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  it("should handle round-trip JSON serialization and deserialization with compression for delete", () => {
    const originalQuery = Q.delete("table").where(Conditions.equal("id", 1));
    const jsonStr = originalQuery.serialize({ compress: true });
    const deserializedQuery = Q.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
});
