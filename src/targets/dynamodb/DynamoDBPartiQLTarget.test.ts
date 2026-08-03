import { Cond } from "../../Condition";
import { Fn } from "../../Function";
import { Query } from "../../Query";
import { DynamoDBPartiQLTarget } from "./DynamoDBPartiQLTarget";

describe("DynamoDBPartiQLTarget", () => {
  const target = new DynamoDBPartiQLTarget();

  describe("compileSelect", () => {
    it("should compile basic select query", () => {
      const query = Query.select().from("Users");
      expect(target.compileSelect(query)).toBe("SELECT * FROM Users");
    });

    it("should compile select with specific fields", () => {
      const query = Query.select()
        .from("Users")
        .addField("id")
        .addField("name")
        .addField("email");
      expect(target.compileSelect(query)).toBe(
        "SELECT id, name, email FROM Users"
      );
    });

    it("should compile select with table alias", () => {
      const query = Query.select().from("Users", "u");
      expect(target.compileSelect(query)).toBe("SELECT * FROM Users AS u");
    });

    it("should compile select with WHERE conditions", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("id", "user123"));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users WHERE id = 'user123'"
      );
    });

    it("should compile select with multiple WHERE conditions", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("pk", "USER#123"))
        .where(Cond.greaterThan("age", 18));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users WHERE pk = 'USER#123' AND age > 18"
      );
    });

    it("should compile select with AND/OR conditions", () => {
      const query = Query.select()
        .from("Users")
        .where(
          Cond.and([
            Cond.equal("status", "active"),
            Cond.or([Cond.equal("role", "admin"), Cond.equal("role", "user")]),
          ])
        );
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users WHERE (status = 'active' AND (role = 'admin' OR role = 'user'))"
      );
    });

    it("should compile select with BETWEEN condition", () => {
      const query = Query.select()
        .from("Orders")
        .where(Cond.between("total", [100, 500]));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Orders WHERE total BETWEEN 100 AND 500"
      );
    });

    it("should compile select with IN condition", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.in("status", ["active", "pending"]));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users WHERE status IN ('active', 'pending')"
      );
    });

    it("should compile NULL check as IS MISSING", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.isNull("deletedAt"));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users WHERE deletedAt IS MISSING"
      );
    });

    it("should compile NOT NULL check as IS NOT MISSING", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.isNotNull("email"));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users WHERE email IS NOT MISSING"
      );
    });

    it("should compile LIKE 'prefix%' as begins_with", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.like("sk", "ORDER#%"));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users WHERE begins_with(sk, 'ORDER#')"
      );
    });

    it("should compile LIKE '%substring%' as contains", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.like("name", "%john%"));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users WHERE contains(name, 'john')"
      );
    });

    it("should compile select with LIMIT", () => {
      const query = Query.select().from("Users").limit(10);
      expect(target.compileSelect(query)).toBe("SELECT * FROM Users LIMIT 10");
    });

    it("should compile select with ORDER BY", () => {
      const query = Query.select()
        .from("Users")
        .orderBy("createdAt", "DESC");
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users ORDER BY createdAt DESC"
      );
    });

    it("should handle numeric values", () => {
      const query = Query.select()
        .from("Products")
        .where(Cond.equal("price", 99.99));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Products WHERE price = 99.99"
      );
    });

    it("should handle boolean values", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("isActive", true));
      expect(target.compileSelect(query)).toBe(
        "SELECT * FROM Users WHERE isActive = TRUE"
      );
    });

    it("should throw on JOIN", () => {
      const query = Query.select()
        .from("Users")
        .leftJoin(Query.table("Orders", "o"), Cond.columnEqual("Users.id", "o.userId"));
      expect(() => target.compileSelect(query)).toThrow(
        "DynamoDB does not support JOIN operations"
      );
    });

    it("should throw on GROUP BY", () => {
      const query = Query.select().from("Orders").groupBy("userId");
      expect(() => target.compileSelect(query)).toThrow(
        "DynamoDB does not support GROUP BY"
      );
    });

    it("should throw on OFFSET", () => {
      const query = Query.select().from("Users").offset(10);
      expect(() => target.compileSelect(query)).toThrow(
        "DynamoDB does not support OFFSET"
      );
    });

    it("should throw on UNION", () => {
      const query1 = Query.select().from("Users");
      const query2 = Query.select().from("Admins");
      const unionQuery = query1.union(query2);
      expect(() => target.compileSelect(unionQuery)).toThrow(
        "DynamoDB does not support UNION"
      );
    });
  });

  describe("compileInsert", () => {
    it("should compile single item insert", () => {
      const mutation = Query.insert("Users").values([
        { id: "user123", name: "John", email: "john@example.com" },
      ]);
      expect(target.compileInsert(mutation)).toBe(
        "INSERT INTO Users VALUE {'id': 'user123', 'name': 'John', 'email': 'john@example.com'}"
      );
    });

    it("should compile multiple item insert as multiple statements", () => {
      const mutation = Query.insert("Users").values([
        { id: "user1", name: "John" },
        { id: "user2", name: "Jane" },
      ]);
      expect(target.compileInsert(mutation)).toBe(
        "INSERT INTO Users VALUE {'id': 'user1', 'name': 'John'};\n" +
          "INSERT INTO Users VALUE {'id': 'user2', 'name': 'Jane'}"
      );
    });

    it("should handle numeric and boolean values", () => {
      const mutation = Query.insert("Products").values([
        { id: "prod1", price: 99.99, inStock: true },
      ]);
      expect(target.compileInsert(mutation)).toBe(
        "INSERT INTO Products VALUE {'id': 'prod1', 'price': 99.99, 'inStock': TRUE}"
      );
    });

    it("should throw on INSERT ... SELECT", () => {
      const selectQuery = Query.select().from("TempUsers");
      const mutation = Query.insert("Users").select(selectQuery);
      expect(() => target.compileInsert(mutation)).toThrow(
        "DynamoDB PartiQL does not support INSERT ... SELECT"
      );
    });
  });

  describe("compileUpdate", () => {
    it("should compile update with single value", () => {
      const mutation = Query.update("Users")
        .set({ name: "John Doe" })
        .where(Cond.equal("id", "user123"));
      expect(target.compileUpdate(mutation)).toBe(
        "UPDATE Users SET name = 'John Doe' WHERE id = 'user123'"
      );
    });

    it("should compile update with multiple values", () => {
      const mutation = Query.update("Users")
        .set({ name: "John Doe", status: "active" })
        .where(Cond.equal("id", "user123"));
      expect(target.compileUpdate(mutation)).toBe(
        "UPDATE Users SET name = 'John Doe', status = 'active' WHERE id = 'user123'"
      );
    });

    it("should throw without WHERE clause", () => {
      const mutation = Query.update("Users").set({ name: "John" });
      expect(() => target.compileUpdate(mutation)).toThrow(
        "DynamoDB UPDATE requires a WHERE clause"
      );
    });
  });

  describe("compileDelete", () => {
    it("should compile delete with WHERE condition", () => {
      const mutation = Query.delete("Users").where(Cond.equal("id", "user123"));
      expect(target.compileDelete(mutation)).toBe(
        "DELETE FROM Users WHERE id = 'user123'"
      );
    });

    it("should compile delete with multiple conditions", () => {
      const mutation = Query.delete("Users")
        .where(Cond.equal("pk", "USER#123"))
        .where(Cond.equal("sk", "PROFILE"));
      expect(target.compileDelete(mutation)).toBe(
        "DELETE FROM Users WHERE pk = 'USER#123' AND sk = 'PROFILE'"
      );
    });

    it("should throw without WHERE clause", () => {
      const mutation = Query.delete("Users");
      expect(() => target.compileDelete(mutation)).toThrow(
        "DynamoDB DELETE requires a WHERE clause"
      );
    });
  });

  describe("compile() method integration", () => {
    it("should work with SelectQuery.compile()", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("id", "123"));
      expect(query.compile(target)).toBe(
        "SELECT * FROM Users WHERE id = '123'"
      );
    });

    it("should work with InsertMutation.compile()", () => {
      const mutation = Query.insert("Users").values([{ id: "123", name: "Test" }]);
      expect(mutation.compile(target)).toBe(
        "INSERT INTO Users VALUE {'id': '123', 'name': 'Test'}"
      );
    });

    it("should work with UpdateMutation.compile()", () => {
      const mutation = Query.update("Users")
        .set({ name: "Test" })
        .where(Cond.equal("id", "123"));
      expect(mutation.compile(target)).toBe(
        "UPDATE Users SET name = 'Test' WHERE id = '123'"
      );
    });

    it("should work with DeleteMutation.compile()", () => {
      const mutation = Query.delete("Users").where(Cond.equal("id", "123"));
      expect(mutation.compile(target)).toBe(
        "DELETE FROM Users WHERE id = '123'"
      );
    });
  });
});
