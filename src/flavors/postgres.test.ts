import { Cond } from "../Condition";
import { Fn } from "../Function";
import { Q } from "../Query";

const flavor = Q.flavors.postgres;

describe("PostgresFlavor", () => {
  describe("Quote escaping", () => {
    it("should use double quotes for column names", () => {
      const query = Q.select()
        .addField("firstName")
        .from("users")
        .where(Cond.equal("status", "active"))
        .orderBy("lastName")
        .limit(10)
        .offset(5);

      const sql = query.toSQL(flavor);
      expect(sql).toContain('"firstName"');
      expect(sql).toContain('"users"');
      expect(sql).toContain('"status"');
      expect(sql).toContain('"lastName"');
      expect(sql).toContain("LIMIT 10");
      expect(sql).toContain("OFFSET 5");
    });

    it("should use single quotes for string values", () => {
      const query = Q.select()
        .addField("name")
        .from("users")
        .where(Cond.equal("status", "active"));

      const sql = query.toSQL(flavor);
      expect(sql).toContain("'active'");
    });
  });

  describe("UPDATE statement", () => {
    it("should properly escape strings in UPDATE", () => {
      const mutation = Q.update("users")
        .set({ name: "John's Value", status: "active" })
        .where(Cond.equal("id", 1));

      const sql = mutation.toSQL(flavor);
      expect(sql).toContain('"users"');
      expect(sql).toContain("'John''s Value'"); // Escaped single quote
      expect(sql).toContain("'active'");
    });
  });

  describe("DATEADD function", () => {
    it("should convert DATEADD to PostgreSQL interval syntax", () => {
      const result = Fn.dateAdd("created_at", 12, "year").toSQL(flavor);
      expect(result).toEqual(`("created_at" + INTERVAL '12 year')`);
    });

    it("should handle negative intervals", () => {
      const result = Fn.dateAdd("date", -5, "month").toSQL(flavor);
      expect(result).toEqual(`("date" + INTERVAL '-5 month')`);
    });

    it("should support standard interval types", () => {
      expect(Fn.dateAdd("d", 1, "year").toSQL(flavor)).toContain("year");
      expect(Fn.dateAdd("d", 1, "month").toSQL(flavor)).toContain("month");
      expect(Fn.dateAdd("d", 1, "day").toSQL(flavor)).toContain("day");
    });

    it("should reject invalid interval types (SQL injection prevention)", () => {
      const maliciousIntervalType = "year'); DROP TABLE users; --";
      expect(() => {
        Fn.dateAdd("date", 1, maliciousIntervalType as any).toSQL(flavor);
      }).toThrow("Invalid DATEADD interval type");
    });

    it("should reject non-numeric interval values", () => {
      expect(() => {
        Fn.dateAdd("date", "abc" as any, "year").toSQL(flavor);
      }).toThrow("Invalid DATEADD interval");
    });

    it("should sanitize interval values to integers", () => {
      const result = Fn.dateAdd(
        "date",
        "5; DROP TABLE users" as any,
        "year"
      ).toSQL(flavor);
      expect(result).toEqual(`("date" + INTERVAL '5 year')`);
      expect(result).not.toContain("DROP TABLE");
    });
  });

  describe("YEAR function", () => {
    it("should convert YEAR to EXTRACT syntax", () => {
      const result = Fn.year("created_at").toSQL(flavor);
      expect(result).toEqual('EXTRACT(YEAR FROM "created_at")');
    });

    it("should work with nested expressions", () => {
      const result = Fn.sum(Fn.year("date")).toSQL(flavor);
      expect(result).toEqual('SUM(EXTRACT(YEAR FROM "date"))');
    });
  });

  describe("MONTH function", () => {
    it("should convert MONTH to EXTRACT syntax", () => {
      const result = Fn.month("created_at").toSQL(flavor);
      expect(result).toEqual('EXTRACT(MONTH FROM "created_at")');
    });

    it("should work with nested expressions", () => {
      const result = Fn.sum(Fn.month("date")).toSQL(flavor);
      expect(result).toEqual('SUM(EXTRACT(MONTH FROM "date"))');
    });
  });

  describe("IF function", () => {
    it("should convert IF to CASE WHEN syntax", () => {
      const result = Fn.if(Cond.equal("status", "active"), "a", "b").toSQL(
        flavor
      );
      expect(result).toEqual(
        `CASE WHEN "status" = 'active' THEN "a" ELSE "b" END`
      );
    });

    it("should handle complex conditions", () => {
      const result = Fn.if(Cond.lessThan("value", 30), "low", "high").toSQL(
        flavor
      );
      expect(result).toEqual(
        'CASE WHEN "value" < 30 THEN "low" ELSE "high" END'
      );
    });

    it("should work nested in SUM", () => {
      const result = Fn.sum(
        Fn.if(Cond.equal("type", "sale"), "amount", Q.value(0))
      ).toSQL(flavor);
      expect(result).toEqual(
        `SUM(CASE WHEN "type" = 'sale' THEN "amount" ELSE 0 END)`
      );
    });
  });

  describe("IFNULL function", () => {
    it("should convert IFNULL to COALESCE", () => {
      const result = Fn.ifnull("nullable_col", Q.value(0)).toSQL(flavor);
      expect(result).toEqual('COALESCE("nullable_col",0)');
    });

    it("should handle string fallback", () => {
      const result = Fn.ifnull("name", Q.S`Unknown`).toSQL(flavor);
      expect(result).toEqual(`COALESCE("name",'Unknown')`);
    });

    it("should work with nested functions", () => {
      const result = Fn.ifnull(
        Fn.concat("firstName", Q.S` `, "lastName"),
        Q.S`Unknown`
      ).toSQL(flavor);
      expect(result).toEqual(
        `COALESCE(CONCAT("firstName",' ',"lastName"),'Unknown')`
      );
    });
  });

  describe("Nested functions", () => {
    it("should handle SUM(IF(...))", () => {
      const result = Fn.sum(
        Fn.if(
          Cond.between("tax_date", ["2020-01-01", "2020-01-31"]),
          "amount",
          Q.value(0)
        )
      ).toSQL(flavor);
      expect(result).toEqual(
        `SUM(CASE WHEN "tax_date" BETWEEN '2020-01-01' AND '2020-01-31' THEN "amount" ELSE 0 END)`
      );
    });

    it("should handle IFNULL(CONCAT(...))", () => {
      const result = Fn.ifnull(
        Fn.concat(Fn.year("date"), Q.S`-`, Fn.month("date")),
        Q.S`N/A`
      ).toSQL(flavor);
      expect(result).toEqual(
        `COALESCE(CONCAT(EXTRACT(YEAR FROM "date"),'-',EXTRACT(MONTH FROM "date")),'N/A')`
      );
    });

    it("should handle complex dateRangeSumField expression", () => {
      const result = Fn.sum(
        Fn.if(
          Cond.between("tax_date", ["2020-01-01", "2020-01-31"]),
          "price_last_year",
          Fn.string("0")
        )
      ).toSQL(flavor);
      expect(result).toEqual(
        `SUM(CASE WHEN "tax_date" BETWEEN '2020-01-01' AND '2020-01-31' THEN "price_last_year" ELSE '0' END)`
      );
    });
  });

  describe("Standard functions (pass-through)", () => {
    it("should handle COUNT", () => {
      expect(Fn.count("*").toSQL(flavor)).toEqual("COUNT(*)");
      expect(Fn.count("id").toSQL(flavor)).toEqual('COUNT("id")');
    });

    it("should handle SUM", () => {
      expect(Fn.sum("amount").toSQL(flavor)).toEqual('SUM("amount")');
    });

    it("should handle MAX/MIN", () => {
      expect(Fn.max("value").toSQL(flavor)).toEqual('MAX("value")');
      expect(Fn.min("value").toSQL(flavor)).toEqual('MIN("value")');
    });

    it("should handle CONCAT", () => {
      expect(Fn.concat("a", "b", "c").toSQL(flavor)).toEqual(
        'CONCAT("a","b","c")'
      );
    });
  });

  describe("Full query generation", () => {
    it("should generate valid PostgreSQL SELECT query", () => {
      const query = Q.select()
        .addField("id")
        .addField("name")
        .from("users")
        .where(Cond.equal("active", true))
        .orderBy("name", "ASC")
        .limit(50)
        .offset(10);

      const sql = query.toSQL(flavor);
      expect(sql).toEqual(
        `SELECT "id", "name" FROM "users" WHERE "active" = true ORDER BY "name" ASC LIMIT 50 OFFSET 10`
      );
    });

    it("should generate valid PostgreSQL query with functions", () => {
      const query = Q.select()
        .addField(Fn.year("created_at"), "year")
        .addField(Fn.sum("amount"), "total")
        .from("transactions")
        .groupBy("year");

      const sql = query.toSQL(flavor);
      expect(sql).toContain('EXTRACT(YEAR FROM "created_at")');
      expect(sql).toContain('SUM("amount")');
    });
  });
});
