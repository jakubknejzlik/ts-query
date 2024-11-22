import { Cond } from "./Condition";
import { Fn } from "./Function";
import { Q } from "./Query";

describe("Mutation builder SQL", () => {
  it("should return SQL for delete", () => {
    expect(Q.delete("users").where(Cond.equal("id", 1)).toSQL()).toEqual(
      "DELETE FROM `users` WHERE `id` = 1"
    );
  });

  it("should return SQL for insert", () => {
    expect(
      Q.insert("users")
        .values([{ name: "John Doe", age: 42, isActive: true }])
        .toSQL()
    ).toEqual(
      'INSERT INTO `users` (`name`, `age`, `isActive`) VALUES ("John Doe", 42, true)'
    );
  });

  it("should return SQL for update", () => {
    expect(
      Q.update("users")
        .set({
          name: "John Doe",
          age: 42,
          isActive: true,
          total: Fn.multiply("amount", "price"),
        })
        .toSQL()
    ).toEqual(
      'UPDATE `users` SET `name` = "John Doe", `age` = 42, `isActive` = true, `total` = (`amount` * `price`)'
    );
  });
});
