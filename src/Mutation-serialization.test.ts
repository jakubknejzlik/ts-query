import { Cond, Conditions } from "./Condition";
import { Fn } from "./Function";
import { MutationBase } from "./Mutation";
import { Q } from "./Query";

describe("Mutation serialization and deserialization", () => {
  it("should handle round-trip JSON serialization and deserialization for a delete", () => {
    const originalQuery = Q.delete("table").where(Conditions.equal("foo", 123));
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = MutationBase.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  it("should handle round-trip JSON serialization and deserialization for an insert with values", () => {
    const originalQuery = Q.insert("table").values([{ foo: 123, bar: "baz" }]);
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = MutationBase.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  it("should handle round-trip JSON serialization and deserialization for an insert with select", () => {
    const originalQuery = Q.insert("users_backup").select(
      Q.select().addField("id").addField("username").from("users"),
      ["id", "username"]
    );
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = MutationBase.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  it("should handle round-trip JSON serialization and deserialization for an update", () => {
    const originalQuery = Q.update("table")
      .set({
        foo: 123,
        bar: "baz",
        total: Q.expr(Fn.multiply("amount", "price")),
        ordersTotal: Q.select()
          .addField(Fn.sum("price"))
          .from("orders")
          .where(Cond.columnEqual("user_id", "u.id")),
      })
      .where(Conditions.equal("foo", 123));
    const ser = originalQuery.serialize();
    const deserializedQuery = MutationBase.deserialize(ser);
    expect(deserializedQuery.toSQL()).toEqual(
      'UPDATE `table` SET `foo` = 123, `bar` = "baz", `total` = (`amount` * `price`), `ordersTotal` = (SELECT SUM(`price`) FROM `orders` WHERE `user_id` = `u`.`id`) WHERE `foo` = 123'
    );
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
});
