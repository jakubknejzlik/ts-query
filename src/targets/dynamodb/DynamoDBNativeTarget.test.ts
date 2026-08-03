import { Cond } from "../../Condition";
import { Query } from "../../Query";
import { DynamoDBNativeTarget } from "./DynamoDBNativeTarget";
import {
  DynamoDBQueryInput,
  DynamoDBScanInput,
  DynamoDBPutItemInput,
  DynamoDBUpdateItemInput,
  DynamoDBDeleteItemInput,
  DynamoDBBatchWriteItemInput,
} from "./types";

describe("DynamoDBNativeTarget", () => {
  describe("compileSelect - Scan mode (no key config)", () => {
    const target = new DynamoDBNativeTarget();

    it("should compile basic select as Scan", () => {
      const query = Query.select().from("Users");
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.TableName).toBe("Users");
      expect(result.FilterExpression).toBeUndefined();
      expect(result.ProjectionExpression).toBeUndefined();
    });

    it("should compile select with fields as ProjectionExpression", () => {
      const query = Query.select()
        .from("Users")
        .addField("id")
        .addField("name");
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.ProjectionExpression).toBe("#n0, #n1");
      expect(result.ExpressionAttributeNames).toEqual({
        "#n0": "id",
        "#n1": "name",
      });
    });

    it("should compile WHERE as FilterExpression", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("status", "active"));
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.FilterExpression).toBe("#n0 = :v0");
      expect(result.ExpressionAttributeNames).toEqual({
        "#n0": "status",
      });
      expect(result.ExpressionAttributeValues).toEqual({
        ":v0": { S: "active" },
      });
    });

    it("should handle multiple WHERE conditions", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("status", "active"))
        .where(Cond.greaterThan("age", 18));
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.FilterExpression).toBe("#n0 = :v0 AND #n1 > :v1");
      expect(result.ExpressionAttributeNames).toEqual({
        "#n0": "status",
        "#n1": "age",
      });
      expect(result.ExpressionAttributeValues).toEqual({
        ":v0": { S: "active" },
        ":v1": { N: "18" },
      });
    });

    it("should handle LIMIT", () => {
      const query = Query.select().from("Users").limit(10);
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.Limit).toBe(10);
    });

    it("should handle BETWEEN condition", () => {
      const query = Query.select()
        .from("Products")
        .where(Cond.between("price", [10, 100]));
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.FilterExpression).toBe("#n0 BETWEEN :v0 AND :v1");
      expect(result.ExpressionAttributeValues).toEqual({
        ":v0": { N: "10" },
        ":v1": { N: "100" },
      });
    });

    it("should handle IN condition", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.in("role", ["admin", "user"]));
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.FilterExpression).toBe("#n0 IN (:v0, :v1)");
      expect(result.ExpressionAttributeValues).toEqual({
        ":v0": { S: "admin" },
        ":v1": { S: "user" },
      });
    });

    it("should handle NULL check as attribute_not_exists", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.isNull("deletedAt"));
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.FilterExpression).toBe("attribute_not_exists(#n0)");
    });

    it("should handle NOT NULL as attribute_exists", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.isNotNull("email"));
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.FilterExpression).toBe("attribute_exists(#n0)");
    });

    it("should handle LIKE prefix as begins_with", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.like("sk", "ORDER#%"));
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.FilterExpression).toBe("begins_with(#n0, :v0)");
      expect(result.ExpressionAttributeValues).toEqual({
        ":v0": { S: "ORDER#" },
      });
    });

    it("should handle LIKE substring as contains", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.like("name", "%john%"));
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.FilterExpression).toBe("contains(#n0, :v0)");
      expect(result.ExpressionAttributeValues).toEqual({
        ":v0": { S: "john" },
      });
    });

    it("should handle AND/OR conditions", () => {
      const query = Query.select()
        .from("Users")
        .where(
          Cond.or([Cond.equal("status", "active"), Cond.equal("status", "pending")])
        );
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.FilterExpression).toBe("(#n0 = :v0 OR #n0 = :v1)");
    });
  });

  describe("compileSelect - Query mode (with key config)", () => {
    const target = new DynamoDBNativeTarget({
      partitionKey: "pk",
      sortKey: "sk",
    });

    it("should compile as Query when partition key is in conditions", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("pk", "USER#123"));
      const result = target.compileSelect(query) as DynamoDBQueryInput;

      expect(result.TableName).toBe("Users");
      expect(result.KeyConditionExpression).toBe("#n0 = :v0");
      expect(result.FilterExpression).toBeUndefined();
    });

    it("should separate key conditions from filter conditions", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("pk", "USER#123"))
        .where(Cond.equal("status", "active"));
      const result = target.compileSelect(query) as DynamoDBQueryInput;

      expect(result.KeyConditionExpression).toBe("#n0 = :v0");
      expect(result.FilterExpression).toBe("#n1 = :v1");
    });

    it("should include sort key in KeyConditionExpression", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("pk", "USER#123"))
        .where(Cond.like("sk", "ORDER#%"));
      const result = target.compileSelect(query) as DynamoDBQueryInput;

      expect(result.KeyConditionExpression).toBe(
        "#n0 = :v0 AND begins_with(#n1, :v1)"
      );
    });

    it("should handle ORDER BY as ScanIndexForward", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("pk", "USER#123"))
        .orderBy("sk", "DESC");
      const result = target.compileSelect(query) as DynamoDBQueryInput;

      expect(result.ScanIndexForward).toBe(false);
    });

    it("should set ScanIndexForward true for ASC", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("pk", "USER#123"))
        .orderBy("sk", "ASC");
      const result = target.compileSelect(query) as DynamoDBQueryInput;

      expect(result.ScanIndexForward).toBe(true);
    });
  });

  describe("compileSelect - with index", () => {
    it("should include IndexName when specified", () => {
      const target = new DynamoDBNativeTarget({
        partitionKey: "gsi1pk",
        sortKey: "gsi1sk",
        indexName: "GSI1",
      });

      const query = Query.select()
        .from("Users")
        .where(Cond.equal("gsi1pk", "EMAIL#john@example.com"));
      const result = target.compileSelect(query) as DynamoDBQueryInput;

      expect(result.IndexName).toBe("GSI1");
    });
  });

  describe("compileSelect - consistent read", () => {
    it("should set ConsistentRead when specified", () => {
      const target = new DynamoDBNativeTarget({ consistentRead: true });

      const query = Query.select().from("Users");
      const result = target.compileSelect(query) as DynamoDBScanInput;

      expect(result.ConsistentRead).toBe(true);
    });
  });

  describe("compileSelect - force scan", () => {
    it("should use Scan when forceScan is true", () => {
      const target = new DynamoDBNativeTarget({
        partitionKey: "pk",
        forceScan: true,
      });

      const query = Query.select()
        .from("Users")
        .where(Cond.equal("pk", "USER#123"));
      const result = target.compileSelect(query) as DynamoDBScanInput;

      // Should be a Scan with FilterExpression, not Query with KeyCondition
      expect(result.FilterExpression).toBe("#n0 = :v0");
      expect((result as any).KeyConditionExpression).toBeUndefined();
    });
  });

  describe("compileInsert", () => {
    const target = new DynamoDBNativeTarget();

    it("should compile single item as PutItem", () => {
      const mutation = Query.insert("Users").values([
        { pk: "USER#123", sk: "PROFILE", name: "John" },
      ]);
      const result = target.compileInsert(mutation) as DynamoDBPutItemInput;

      expect(result.TableName).toBe("Users");
      expect(result.Item).toEqual({
        pk: { S: "USER#123" },
        sk: { S: "PROFILE" },
        name: { S: "John" },
      });
    });

    it("should handle different value types", () => {
      const mutation = Query.insert("Products").values([
        {
          id: "prod1",
          price: 99.99,
          inStock: true,
          tags: ["electronics", "sale"],
        },
      ]);
      const result = target.compileInsert(mutation) as DynamoDBPutItemInput;

      expect(result.Item).toEqual({
        id: { S: "prod1" },
        price: { N: "99.99" },
        inStock: { BOOL: true },
        tags: { SS: ["electronics", "sale"] },
      });
    });

    it("should compile multiple items as BatchWriteItem", () => {
      const mutation = Query.insert("Users").values([
        { pk: "USER#1", sk: "PROFILE", name: "John" },
        { pk: "USER#2", sk: "PROFILE", name: "Jane" },
      ]);
      const result = target.compileInsert(
        mutation
      ) as DynamoDBBatchWriteItemInput;

      expect(result.RequestItems).toBeDefined();
      expect(result.RequestItems.Users).toHaveLength(2);
      expect(result.RequestItems.Users[0].PutRequest?.Item).toEqual({
        pk: { S: "USER#1" },
        sk: { S: "PROFILE" },
        name: { S: "John" },
      });
    });
  });

  describe("compileUpdate", () => {
    const target = new DynamoDBNativeTarget({
      partitionKey: "pk",
      sortKey: "sk",
    });

    it("should compile update with key and values", () => {
      const mutation = Query.update("Users")
        .set({ name: "John Doe", age: 30 })
        .where(Cond.equal("pk", "USER#123"))
        .where(Cond.equal("sk", "PROFILE"));
      const result = target.compileUpdate(mutation) as DynamoDBUpdateItemInput;

      expect(result.TableName).toBe("Users");
      expect(result.Key).toEqual({
        pk: { S: "USER#123" },
        sk: { S: "PROFILE" },
      });
      expect(result.UpdateExpression).toBe("SET #n0 = :v0, #n1 = :v1");
      expect(result.ExpressionAttributeNames).toEqual({
        "#n0": "name",
        "#n1": "age",
      });
      expect(result.ExpressionAttributeValues).toEqual({
        ":v0": { S: "John Doe" },
        ":v1": { N: "30" },
      });
    });

    it("should throw without WHERE clause", () => {
      const mutation = Query.update("Users").set({ name: "John" });
      expect(() => target.compileUpdate(mutation)).toThrow(
        "DynamoDB UPDATE requires a WHERE clause"
      );
    });
  });

  describe("compileDelete", () => {
    const target = new DynamoDBNativeTarget({
      partitionKey: "pk",
      sortKey: "sk",
    });

    it("should compile delete with key", () => {
      const mutation = Query.delete("Users")
        .where(Cond.equal("pk", "USER#123"))
        .where(Cond.equal("sk", "PROFILE"));
      const result = target.compileDelete(mutation) as DynamoDBDeleteItemInput;

      expect(result.TableName).toBe("Users");
      expect(result.Key).toEqual({
        pk: { S: "USER#123" },
        sk: { S: "PROFILE" },
      });
    });

    it("should throw without WHERE clause", () => {
      const mutation = Query.delete("Users");
      expect(() => target.compileDelete(mutation)).toThrow(
        "DynamoDB DELETE requires a WHERE clause"
      );
    });
  });

  describe("validation", () => {
    const target = new DynamoDBNativeTarget();

    it("should throw on JOIN", () => {
      const query = Query.select()
        .from("Users")
        .leftJoin(
          Query.table("Orders", "o"),
          Cond.columnEqual("Users.id", "o.userId")
        );
      expect(() => target.compileSelect(query)).toThrow(
        "DynamoDB does not support JOIN"
      );
    });

    it("should throw on GROUP BY", () => {
      const query = Query.select().from("Orders").groupBy("userId");
      expect(() => target.compileSelect(query)).toThrow(
        "DynamoDB does not support GROUP BY"
      );
    });

    it("should throw on HAVING", () => {
      const query = Query.select()
        .from("Orders")
        .groupBy("userId")
        .having(Cond.greaterThan("count", 5));
      expect(() => target.compileSelect(query)).toThrow(
        "DynamoDB does not support"
      );
    });

    it("should throw on OFFSET", () => {
      const query = Query.select().from("Users").offset(10);
      expect(() => target.compileSelect(query)).toThrow(
        "DynamoDB does not support OFFSET"
      );
    });
  });

  describe("compile() method integration", () => {
    const target = new DynamoDBNativeTarget({
      partitionKey: "pk",
      sortKey: "sk",
    });

    it("should work with SelectQuery using target.compileSelect()", () => {
      const query = Query.select()
        .from("Users")
        .where(Cond.equal("pk", "USER#123"));
      const result = target.compileSelect(query);
      expect(result.TableName).toBe("Users");
    });

    it("should work with InsertMutation using target.compileInsert()", () => {
      const mutation = Query.insert("Users").values([
        { pk: "USER#123", sk: "PROFILE" },
      ]);
      const result = target.compileInsert(mutation) as DynamoDBPutItemInput;
      expect(result.TableName).toBe("Users");
      expect(result.Item).toBeDefined();
    });

    it("should work with UpdateMutation using target.compileUpdate()", () => {
      const mutation = Query.update("Users")
        .set({ name: "Test" })
        .where(Cond.equal("pk", "123"))
        .where(Cond.equal("sk", "PROFILE"));
      const result = target.compileUpdate(mutation) as DynamoDBUpdateItemInput;
      expect(result.TableName).toBe("Users");
      expect(result.UpdateExpression).toBeDefined();
    });

    it("should work with DeleteMutation using target.compileDelete()", () => {
      const mutation = Query.delete("Users")
        .where(Cond.equal("pk", "123"))
        .where(Cond.equal("sk", "PROFILE"));
      const result = target.compileDelete(mutation) as DynamoDBDeleteItemInput;
      expect(result.TableName).toBe("Users");
      expect(result.Key).toBeDefined();
    });
  });
});
