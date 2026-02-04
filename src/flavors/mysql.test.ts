import { Cond } from "../Condition";
import { Fn } from "../Function";
import { Q } from "../Query";

const flavor = Q.flavors.mysql;

describe("MySQLFlavor", () => {
  describe("Quote escaping", () => {
    it("should use backticks for column names", () => {
      const query = Q.select()
        .addField("firstName")
        .from("users")
        .where(Cond.equal("status", "active"))
        .orderBy("lastName")
        .limit(10)
        .offset(5);

      const sql = query.toSQL(flavor);
      expect(sql).toContain("`firstName`");
      expect(sql).toContain("`users`");
      expect(sql).toContain("`status`");
      expect(sql).toContain("`lastName`");
      expect(sql).toContain("LIMIT 10");
      expect(sql).toContain("OFFSET 5");
    });

    it("should use double quotes for string values", () => {
      const query = Q.select()
        .addField("name")
        .from("users")
        .where(Cond.equal("status", "active"));

      const sql = query.toSQL(flavor);
      expect(sql).toContain('"active"');
    });
  });

  describe("UPDATE statement", () => {
    it("should properly escape strings in UPDATE", () => {
      const mutation = Q.update("users")
        .set({ name: "John's Value", status: "active" })
        .where(Cond.equal("id", 1));

      const sql = mutation.toSQL(flavor);
      expect(sql).toContain("`users`");
      expect(sql).toContain(`"John's Value"`);
      expect(sql).toContain('"active"');
    });

    it("should escape double quotes in string values", () => {
      const mutation = Q.update("table").set({ foo: `'aa'xx"` });
      expect(mutation.toSQL(flavor)).toEqual(
        'UPDATE `table` SET `foo` = "\'aa\'xx"""'
      );
    });
  });

  describe("DATEADD function", () => {
    it("should convert DATEADD to MySQL interval syntax", () => {
      const result = Fn.dateAdd("created_at", 12, "year").toSQL(flavor);
      expect(result).toEqual("DATE_ADD(`created_at`, INTERVAL 12 YEAR)");
    });

    it("should handle negative intervals", () => {
      const result = Fn.dateAdd("date", -5, "month").toSQL(flavor);
      expect(result).toEqual("DATE_ADD(`date`, INTERVAL -5 MONTH)");
    });

    it("should support standard interval types", () => {
      expect(Fn.dateAdd("d", 1, "year").toSQL(flavor)).toContain("YEAR");
      expect(Fn.dateAdd("d", 1, "month").toSQL(flavor)).toContain("MONTH");
      expect(Fn.dateAdd("d", 1, "day").toSQL(flavor)).toContain("DAY");
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
      expect(result).toEqual("DATE_ADD(`date`, INTERVAL 5 YEAR)");
      expect(result).not.toContain("DROP TABLE");
    });
  });

  describe("YEAR function", () => {
    it("should output YEAR syntax", () => {
      const result = Fn.year("created_at").toSQL(flavor);
      expect(result).toEqual("YEAR(`created_at`)");
    });

    it("should work with nested expressions", () => {
      const result = Fn.sum(Fn.year("date")).toSQL(flavor);
      expect(result).toEqual("SUM(YEAR(`date`))");
    });
  });

  describe("MONTH function", () => {
    it("should output MONTH syntax", () => {
      const result = Fn.month("created_at").toSQL(flavor);
      expect(result).toEqual("MONTH(`created_at`)");
    });

    it("should work with nested expressions", () => {
      const result = Fn.sum(Fn.month("date")).toSQL(flavor);
      expect(result).toEqual("SUM(MONTH(`date`))");
    });
  });

  describe("IF function", () => {
    it("should output IF syntax", () => {
      const result = Fn.if(Cond.equal("status", "active"), "a", "b").toSQL(
        flavor
      );
      expect(result).toEqual('IF(`status` = "active",`a`,`b`)');
    });

    it("should handle complex conditions", () => {
      const result = Fn.if(Cond.lessThan("value", 30), "low", "high").toSQL(
        flavor
      );
      expect(result).toEqual("IF(`value` < 30,`low`,`high`)");
    });

    it("should work nested in SUM", () => {
      const result = Fn.sum(
        Fn.if(Cond.equal("type", "sale"), "amount", Q.value(0))
      ).toSQL(flavor);
      expect(result).toEqual('SUM(IF(`type` = "sale",`amount`,0))');
    });
  });

  describe("IFNULL function", () => {
    it("should output IFNULL syntax", () => {
      const result = Fn.ifnull("nullable_col", Q.value(0)).toSQL(flavor);
      expect(result).toEqual("IFNULL(`nullable_col`,0)");
    });

    it("should handle string fallback", () => {
      const result = Fn.ifnull("name", Q.S`Unknown`).toSQL(flavor);
      expect(result).toEqual('IFNULL(`name`,"Unknown")');
    });

    it("should work with nested functions", () => {
      const result = Fn.ifnull(
        Fn.concat("firstName", Q.S` `, "lastName"),
        Q.S`Unknown`
      ).toSQL(flavor);
      expect(result).toEqual(
        'IFNULL(CONCAT(`firstName`," ",`lastName`),"Unknown")'
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
        'SUM(IF(`tax_date` BETWEEN "2020-01-01" AND "2020-01-31",`amount`,0))'
      );
    });

    it("should handle IFNULL(CONCAT(...))", () => {
      const result = Fn.ifnull(
        Fn.concat(Fn.year("date"), Q.S`-`, Fn.month("date")),
        Q.S`N/A`
      ).toSQL(flavor);
      expect(result).toEqual(
        'IFNULL(CONCAT(YEAR(`date`),"-",MONTH(`date`)),"N/A")'
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
        'SUM(IF(`tax_date` BETWEEN "2020-01-01" AND "2020-01-31",`price_last_year`,"0"))'
      );
    });
  });

  describe("Standard functions (pass-through)", () => {
    it("should handle COUNT", () => {
      expect(Fn.count("*").toSQL(flavor)).toEqual("COUNT(*)");
      expect(Fn.count("id").toSQL(flavor)).toEqual("COUNT(`id`)");
    });

    it("should handle SUM", () => {
      expect(Fn.sum("amount").toSQL(flavor)).toEqual("SUM(`amount`)");
    });

    it("should handle MAX/MIN", () => {
      expect(Fn.max("value").toSQL(flavor)).toEqual("MAX(`value`)");
      expect(Fn.min("value").toSQL(flavor)).toEqual("MIN(`value`)");
    });

    it("should handle CONCAT", () => {
      expect(Fn.concat("a", "b", "c").toSQL(flavor)).toEqual(
        "CONCAT(`a`,`b`,`c`)"
      );
    });

    it("should handle AVG", () => {
      expect(Fn.avg("score").toSQL(flavor)).toEqual("AVG(`score`)");
    });
  });

  describe("Full query generation", () => {
    it("should generate valid MySQL SELECT query", () => {
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
        "SELECT `id`, `name` FROM `users` WHERE `active` = true ORDER BY `name` ASC LIMIT 50 OFFSET 10"
      );
    });

    it("should generate valid MySQL query with functions", () => {
      const query = Q.select()
        .addField(Fn.year("created_at"), "year")
        .addField(Fn.sum("amount"), "total")
        .from("transactions")
        .groupBy("year");

      const sql = query.toSQL(flavor);
      expect(sql).toContain("YEAR(`created_at`)");
      expect(sql).toContain("SUM(`amount`)");
    });

    it("should generate valid MySQL INSERT query", () => {
      const mutation = Q.insert("users").values([
        { name: "John", email: "john@example.com" },
        { name: "Jane", email: "jane@example.com" },
      ]);

      const sql = mutation.toSQL(flavor);
      expect(sql).toContain("INSERT INTO `users`");
      expect(sql).toContain('"John"');
      expect(sql).toContain('"john@example.com"');
    });

    it("should generate valid MySQL DELETE query", () => {
      const mutation = Q.delete("users").where(Cond.equal("active", false));

      const sql = mutation.toSQL(flavor);
      expect(sql).toEqual("DELETE FROM `users` WHERE `active` = false");
    });

    it("should generate valid MySQL query with JOIN", () => {
      const query = Q.select()
        .addField("users.name")
        .addField("orders.total")
        .from("users", "u")
        .join(
          Q.table("orders", "o"),
          Cond.columnEqual("users.id", "orders.user_id")
        );

      const sql = query.toSQL(flavor);
      expect(sql).toContain("INNER JOIN `orders` AS `o` ON");
      expect(sql).toContain("`users`.`id` = `orders`.`user_id`");
    });
  });

  describe("Edge cases", () => {
    it("should handle NULL values", () => {
      const result = Cond.isNull("column").toSQL(flavor);
      expect(result).toEqual("`column` IS NULL");
    });

    it("should handle NOT NULL values", () => {
      const result = Cond.isNotNull("column").toSQL(flavor);
      expect(result).toEqual("`column` IS NOT NULL");
    });

    it("should handle empty strings", () => {
      const result = Cond.equal("column", "").toSQL(flavor);
      expect(result).toEqual('`column` = ""');
    });

    it("should handle boolean values", () => {
      expect(Cond.equal("active", true).toSQL(flavor)).toEqual(
        "`active` = true"
      );
      expect(Cond.equal("active", false).toSQL(flavor)).toEqual(
        "`active` = false"
      );
    });

    it("should handle numeric values", () => {
      expect(Cond.equal("count", 0).toSQL(flavor)).toEqual("`count` = 0");
      expect(Cond.equal("price", 123.45).toSQL(flavor)).toEqual(
        "`price` = 123.45"
      );
      expect(Cond.equal("negative", -10).toSQL(flavor)).toEqual(
        "`negative` = -10"
      );
    });

    it("should handle special characters in strings", () => {
      const result = Q.update("table")
        .set({ value: "line1\nline2\ttab" })
        .toSQL(flavor);
      expect(result).toContain("line1\nline2\ttab");
    });

    it("should handle LIKE patterns", () => {
      const result = Cond.like("name", "%test%").toSQL(flavor);
      expect(result).toEqual('`name` LIKE "%test%"');
    });

    it("should handle IN with array values", () => {
      const result = Cond.in("status", ["active", "pending", "review"])?.toSQL(
        flavor
      );
      expect(result).toEqual('`status` IN ("active", "pending", "review")');
    });

    it("should handle NOT IN with array values", () => {
      // NotInCondition treats values as string literals, consistent with InCondition
      const result = Cond.notIn("status", ["deleted", "banned"]).toSQL(flavor);
      expect(result).toEqual('`status` NOT IN ("deleted", "banned")');
    });

    it("should handle BETWEEN with numeric values", () => {
      const result = Cond.between("price", [10, 100]).toSQL(flavor);
      expect(result).toEqual("`price` BETWEEN 10 AND 100");
    });
  });
});
