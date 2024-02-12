import { Conditions } from "./Condition";
import { MutationBase } from "./Mutation";
import { Q } from "./Query";

describe("Mutation serialization and deserialization", () => {
  it("should handle round-trip JSON serialization and deserialization for a delete", () => {
    const originalQuery = Q.delete("table").where(Conditions.equal("foo", 123));
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = MutationBase.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  it("should handle round-trip JSON serialization and deserialization for an insert", () => {
    const originalQuery = Q.insert("table").values([{ foo: 123, bar: "baz" }]);
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = MutationBase.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  it("should handle round-trip JSON serialization and deserialization for an update", () => {
    const originalQuery = Q.update("table")
      .set({ foo: 123, bar: "baz" })
      .where(Conditions.equal("foo", 123));
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = MutationBase.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
});
