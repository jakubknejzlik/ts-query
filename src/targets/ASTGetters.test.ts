import {
  BinaryCondition,
  Cond,
  LogicalCondition,
  InCondition,
} from "../Condition";
import { Fn } from "../Function";
import { Q, Query, UnionType } from "../Query";

describe("AST Getters", () => {
  describe("SelectQuery getters", () => {
    it("should expose fields via getFields()", () => {
      const query = Query.select()
        .from("users")
        .addField("id")
        .addField("name", "userName");

      const fields = query.getFields();
      expect(fields).toHaveLength(2);
      expect(fields[0].alias).toBeUndefined();
      expect(fields[1].alias).toBe("userName");
    });

    it("should expose where conditions via getWhere()", () => {
      const query = Query.select()
        .from("users")
        .where(Cond.equal("id", 1))
        .where(Cond.equal("status", "active"));

      const where = query.getWhere();
      expect(where).toHaveLength(2);
      expect(where[0]).toBeInstanceOf(BinaryCondition);
      expect(where[1]).toBeInstanceOf(BinaryCondition);
    });

    it("should expose having conditions via getHaving()", () => {
      const query = Query.select()
        .from("orders")
        .groupBy("user_id")
        .having(Cond.greaterThan(Fn.count("*"), 5));

      const having = query.getHaving();
      expect(having).toHaveLength(1);
      expect(having[0]).toBeInstanceOf(BinaryCondition);
    });

    it("should expose joins via getJoins()", () => {
      const query = Query.select()
        .from("users")
        .leftJoin(
          Q.table("orders", "o"),
          Cond.columnEqual("users.id", "o.user_id")
        )
        .innerJoin(
          Q.table("products", "p"),
          Cond.columnEqual("o.product_id", "p.id")
        );

      const joins = query.getJoins();
      expect(joins).toHaveLength(2);
      expect(joins[0].getType()).toBe("LEFT");
      expect(joins[1].getType()).toBe("INNER");
    });

    it("should expose limit via getLimit()", () => {
      const query = Query.select().from("users").limit(10);
      expect(query.getLimit()).toBe(10);
    });

    it("should expose offset via getOffset()", () => {
      const query = Query.select().from("users").offset(20);
      expect(query.getOffset()).toBe(20);
    });

    it("should expose orderBy via getOrderBy()", () => {
      const query = Query.select()
        .from("users")
        .orderBy("name", "ASC")
        .orderBy("created_at", "DESC");

      const orderBy = query.getOrderBy();
      expect(orderBy).toHaveLength(2);
      expect(orderBy[0].direction).toBe("ASC");
      expect(orderBy[1].direction).toBe("DESC");
    });

    it("should expose groupBy via getGroupBy()", () => {
      const query = Query.select()
        .from("orders")
        .groupBy("user_id", "status");

      const groupBy = query.getGroupBy();
      expect(groupBy).toHaveLength(2);
    });

    it("should expose union queries via getUnionQueries()", () => {
      const query1 = Query.select().from("active_users");
      const query2 = Query.select().from("archived_users");
      const unionQuery = query1.union(query2, UnionType.UNION_ALL);

      const unions = unionQuery.getUnionQueries();
      expect(unions).toHaveLength(1);
      expect(unions[0].type).toBe(UnionType.UNION_ALL);
    });
  });

  describe("Join getters", () => {
    it("should expose join properties", () => {
      const query = Query.select()
        .from("users")
        .leftJoin(
          Q.table("orders", "o"),
          Cond.columnEqual("users.id", "o.user_id")
        );

      const join = query.getJoins()[0];
      expect(join.getType()).toBe("LEFT");
      expect(join.getTable().alias).toBe("o");
      expect(join.getCondition()).toBeDefined();
    });
  });

  describe("Mutation getters", () => {
    it("should expose table via getTable() on DeleteMutation", () => {
      const mutation = Query.delete("users").where(Cond.equal("id", 1));
      expect(mutation.getTable().getTableName()).toBe("users");
    });

    it("should expose where via getWhere() on DeleteMutation", () => {
      const mutation = Query.delete("users")
        .where(Cond.equal("id", 1))
        .where(Cond.equal("status", "inactive"));
      expect(mutation.getWhere()).toHaveLength(2);
    });

    it("should expose values via getValues() on InsertMutation", () => {
      const mutation = Query.insert("users").values([
        { name: "John", email: "john@example.com" },
      ]);
      const values = mutation.getValues();
      expect(values).toHaveLength(1);
      expect(values[0]).toHaveProperty("name");
      expect(values[0]).toHaveProperty("email");
    });

    it("should expose select via getSelectWithColumns() on InsertMutation", () => {
      const selectQuery = Query.select().from("temp_users");
      const mutation = Query.insert("users").select(selectQuery, [
        "name",
        "email",
      ]);
      const [select, columns] = mutation.getSelectWithColumns();
      expect(select).toBeDefined();
      expect(columns).toEqual(["name", "email"]);
    });

    it("should expose values via getSetValues() on UpdateMutation", () => {
      const mutation = Query.update("users")
        .set({ name: "John", status: "active" })
        .where(Cond.equal("id", 1));
      const values = mutation.getSetValues();
      expect(values).toHaveProperty("name");
      expect(values).toHaveProperty("status");
    });

    it("should expose where via getWhere() on UpdateMutation", () => {
      const mutation = Query.update("users")
        .set({ name: "John" })
        .where(Cond.equal("id", 1))
        .where(Cond.equal("version", 1));
      expect(mutation.getWhere()).toHaveLength(2);
    });
  });

  describe("Condition types for instanceof checks", () => {
    it("should allow instanceof checks on BinaryCondition", () => {
      const cond = Cond.equal("id", 1);
      expect(cond).toBeInstanceOf(BinaryCondition);
    });

    it("should allow instanceof checks on LogicalCondition", () => {
      const cond = Cond.and([Cond.equal("a", 1), Cond.equal("b", 2)]);
      expect(cond).toBeInstanceOf(LogicalCondition);
    });

    it("should allow instanceof checks on InCondition", () => {
      const cond = Cond.in("status", ["active", "pending"]);
      expect(cond).toBeInstanceOf(InCondition);
    });
  });
});
