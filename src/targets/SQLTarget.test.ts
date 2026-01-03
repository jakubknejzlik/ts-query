import { Cond } from "../Condition";
import { Fn } from "../Function";
import { Q, Query } from "../Query";
import { SQLTarget } from "./SQLTarget";

describe("SQLTarget", () => {
  const mysqlTarget = new SQLTarget(Q.flavors.mysql);
  const sqliteTarget = new SQLTarget(Q.flavors.sqlite);

  describe("compileSelect", () => {
    it("should compile basic select query", () => {
      const query = Query.select().from("users");
      expect(mysqlTarget.compileSelect(query)).toEqual("SELECT * FROM `users`");
    });

    it("should compile select with fields", () => {
      const query = Query.select()
        .from("users")
        .addField("id")
        .addField("name");
      expect(mysqlTarget.compileSelect(query)).toEqual(
        "SELECT `id`, `name` FROM `users`"
      );
    });

    it("should compile select with conditions", () => {
      const query = Query.select()
        .from("users")
        .where(Cond.equal("status", "active"))
        .where(Cond.greaterThan("age", 18));
      expect(mysqlTarget.compileSelect(query)).toEqual(
        'SELECT * FROM `users` WHERE `status` = "active" AND `age` > 18'
      );
    });

    it("should compile select with joins", () => {
      const query = Query.select()
        .from("users")
        .leftJoin(Q.table("orders", "o"), Cond.columnEqual("users.id", "o.user_id"));
      expect(mysqlTarget.compileSelect(query)).toEqual(
        "SELECT * FROM `users` LEFT JOIN `orders` AS `o` ON `users`.`id` = `o`.`user_id`"
      );
    });

    it("should compile select with group by and having", () => {
      const query = Query.select()
        .from("orders")
        .addField("user_id")
        .addField(Fn.count("*"), "order_count")
        .groupBy("user_id")
        .having(Cond.greaterThan(Fn.count("*"), 5));
      expect(mysqlTarget.compileSelect(query)).toEqual(
        "SELECT `user_id`, COUNT(*) AS `order_count` FROM `orders` GROUP BY `user_id` HAVING COUNT(*) > 5"
      );
    });

    it("should work with different SQL flavors", () => {
      const query = Query.select().from("users").limit(10);
      expect(mysqlTarget.compileSelect(query)).toEqual(
        "SELECT * FROM `users` LIMIT 10"
      );
      expect(sqliteTarget.compileSelect(query)).toEqual(
        "SELECT * FROM `users` LIMIT 10"
      );
    });
  });

  describe("compileInsert", () => {
    it("should compile insert with values", () => {
      const mutation = Query.insert("users").values([
        { name: "John", email: "john@example.com" },
      ]);
      expect(mysqlTarget.compileInsert(mutation)).toEqual(
        'INSERT INTO `users` (`name`, `email`) VALUES ("John", "john@example.com")'
      );
    });

    it("should compile insert with multiple rows", () => {
      const mutation = Query.insert("users").values([
        { name: "John", email: "john@example.com" },
        { name: "Jane", email: "jane@example.com" },
      ]);
      expect(mysqlTarget.compileInsert(mutation)).toEqual(
        'INSERT INTO `users` (`name`, `email`) VALUES ("John", "john@example.com"), ("Jane", "jane@example.com")'
      );
    });

    it("should compile insert from select", () => {
      const selectQuery = Query.select()
        .from("temp_users")
        .addField("name")
        .addField("email");
      const mutation = Query.insert("users").select(selectQuery, [
        "name",
        "email",
      ]);
      expect(mysqlTarget.compileInsert(mutation)).toEqual(
        "INSERT INTO `users` (`name`, `email`) SELECT `name`, `email` FROM `temp_users`"
      );
    });
  });

  describe("compileUpdate", () => {
    it("should compile update with values", () => {
      const mutation = Query.update("users")
        .set({ name: "John Doe" })
        .where(Cond.equal("id", 1));
      expect(mysqlTarget.compileUpdate(mutation)).toEqual(
        'UPDATE `users` SET `name` = "John Doe" WHERE `id` = 1'
      );
    });

    it("should compile update with multiple values", () => {
      const mutation = Query.update("users")
        .set({ name: "John Doe", status: "active" })
        .where(Cond.equal("id", 1));
      expect(mysqlTarget.compileUpdate(mutation)).toEqual(
        'UPDATE `users` SET `name` = "John Doe", `status` = "active" WHERE `id` = 1'
      );
    });
  });

  describe("compileDelete", () => {
    it("should compile delete with condition", () => {
      const mutation = Query.delete("users").where(Cond.equal("id", 1));
      expect(mysqlTarget.compileDelete(mutation)).toEqual(
        "DELETE FROM `users` WHERE `id` = 1"
      );
    });

    it("should compile delete with multiple conditions", () => {
      const mutation = Query.delete("users")
        .where(Cond.equal("status", "inactive"))
        .where(Cond.lessThan("last_login", "2024-01-01"));
      expect(mysqlTarget.compileDelete(mutation)).toEqual(
        'DELETE FROM `users` WHERE `status` = "inactive" AND `last_login` < "2024-01-01"'
      );
    });
  });

  describe("compile() method on query objects", () => {
    it("should work with SelectQuery.compile()", () => {
      const query = Query.select().from("users").where(Cond.equal("id", 1));
      expect(query.compile(mysqlTarget)).toEqual(
        "SELECT * FROM `users` WHERE `id` = 1"
      );
    });

    it("should work with InsertMutation.compile()", () => {
      const mutation = Query.insert("users").values([{ name: "John" }]);
      expect(mutation.compile(mysqlTarget)).toEqual(
        'INSERT INTO `users` (`name`) VALUES ("John")'
      );
    });

    it("should work with UpdateMutation.compile()", () => {
      const mutation = Query.update("users")
        .set({ name: "John" })
        .where(Cond.equal("id", 1));
      expect(mutation.compile(mysqlTarget)).toEqual(
        'UPDATE `users` SET `name` = "John" WHERE `id` = 1'
      );
    });

    it("should work with DeleteMutation.compile()", () => {
      const mutation = Query.delete("users").where(Cond.equal("id", 1));
      expect(mutation.compile(mysqlTarget)).toEqual(
        "DELETE FROM `users` WHERE `id` = 1"
      );
    });
  });

  describe("withOptions", () => {
    it("should create new target with options", () => {
      const targetWithOptions = mysqlTarget.withOptions({
        transformTable: (table) => `prefix_${table}`,
      });
      expect(targetWithOptions).not.toBe(mysqlTarget);
      expect(targetWithOptions.getOptions()).toBeDefined();
    });
  });
});
