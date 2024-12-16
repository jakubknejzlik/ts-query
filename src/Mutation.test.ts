import { Cond } from "./Condition";
import { Fn } from "./Function";
import { Q } from "./Query";

describe("Mutation builder SQL", () => {
  it("should return SQL for delete", () => {
    expect(Q.delete("users").where(Cond.equal("id", 1)).toSQL()).toEqual(
      "DELETE FROM `users` WHERE `id` = 1"
    );
  });

  it("should fail with empty insert", () => {
    expect(() => console.log(Q.insert("users").toSQL())).toThrow(
      new Error("values or select must be set for insert query")
    );
  });

  it("should return SQL for insert values", () => {
    expect(
      Q.insert("users")
        .values([{ id: null, name: "John Doe", age: 42, isActive: true }])
        .toSQL()
    ).toEqual(
      'INSERT INTO `users` (`id`, `name`, `age`, `isActive`) VALUES (NULL, "John Doe", 42, true)'
    );
  });

  it("should generate SQL for insert select", () => {
    expect(
      Q.insert("users_backup").select(Q.select().from("users")).toSQL()
    ).toEqual("INSERT INTO `users_backup` SELECT * FROM `users`");
  });

  it("should generate SQL for insert select with columns", () => {
    expect(
      Q.insert("users_backup")
        .select(Q.select().addField("id").addField("username").from("users"), [
          "id",
          "username",
        ])
        .toSQL()
    ).toEqual(
      "INSERT INTO `users_backup` (`id`, `username`) SELECT `id`, `username` FROM `users`"
    );
  });

  it("should return SQL for update", () => {
    expect(
      Q.update("users", "u")
        .set({
          name: "John Doe",
          age: 42,
          isActive: true,
          total: Fn.multiply("amount", "price"),
          null: null,
          ordersTotal: Q.select()
            .addField(Fn.sum("price"))
            .from("orders")
            .where(Cond.columnEqual("user_id", "u.id")),
        })
        .toSQL()
    ).toEqual(
      'UPDATE `users` AS `u` SET `name` = "John Doe", `age` = 42, `isActive` = true, `total` = (`amount` * `price`), `null` = NULL, `ordersTotal` = (SELECT SUM(`price`) FROM `orders` WHERE `user_id` = `u`.`id`)'
    );
  });
});
