import { Cond } from "../Condition";
import { Fn } from "../Function";
import { Q } from "../Query";

const flavor = Q.flavors.sqlite;

describe("SQLiteFlavor", () => {
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
      expect(sql).toContain("`users`");
      expect(sql).toContain("'John''s Value'"); // Escaped single quote
      expect(sql).toContain("'active'");
    });

    it("should escape single quotes in string values", () => {
      const mutation = Q.update("table").set({ foo: `'aa'xx"` });
      expect(mutation.toSQL(flavor)).toEqual(
        "UPDATE `table` SET `foo` = '''aa''xx\"'"
      );
    });
  });

  describe("DATEADD function", () => {
    it("should convert DATEADD to SQLite DateTime syntax", () => {
      const result = Fn.dateAdd("created_at", 12, "year").toSQL(flavor);
      expect(result).toEqual("DateTime(`created_at`, '+12 year')");
    });

    it("should handle negative intervals", () => {
      const result = Fn.dateAdd("date", -5, "month").toSQL(flavor);
      expect(result).toEqual("DateTime(`date`, '-5 month')");
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
      expect(result).toEqual("DateTime(`date`, '+5 year')");
      expect(result).not.toContain("DROP TABLE");
    });
  });

  describe("YEAR function", () => {
    it("should convert YEAR to strftime syntax", () => {
      const result = Fn.year("created_at").toSQL(flavor);
      expect(result).toEqual("strftime('%Y', `created_at`, 'localtime')");
    });

    it("should work with nested expressions", () => {
      const result = Fn.sum(Fn.year("date")).toSQL(flavor);
      expect(result).toEqual("SUM(strftime('%Y', `date`, 'localtime'))");
    });
  });

  describe("MONTH function", () => {
    it("should convert MONTH to strftime syntax", () => {
      const result = Fn.month("created_at").toSQL(flavor);
      expect(result).toEqual("strftime('%m', `created_at`, 'localtime')");
    });

    it("should work with nested expressions", () => {
      const result = Fn.sum(Fn.month("date")).toSQL(flavor);
      expect(result).toEqual("SUM(strftime('%m', `date`, 'localtime'))");
    });
  });

  describe("IF function", () => {
    it("should convert IF to IIF syntax", () => {
      const result = Fn.if(Cond.equal("status", "active"), "a", "b").toSQL(
        flavor
      );
      expect(result).toEqual("IIF(`status` = 'active', `a`, `b`)");
    });

    it("should handle complex conditions", () => {
      const result = Fn.if(Cond.lessThan("value", 30), "low", "high").toSQL(
        flavor
      );
      expect(result).toEqual("IIF(`value` < 30, `low`, `high`)");
    });

    it("should work nested in SUM", () => {
      const result = Fn.sum(
        Fn.if(Cond.equal("type", "sale"), "amount", Q.value(0))
      ).toSQL(flavor);
      expect(result).toEqual("SUM(IIF(`type` = 'sale', `amount`, 0))");
    });
  });

  describe("IFNULL function", () => {
    it("should output IFNULL syntax", () => {
      const result = Fn.ifnull("nullable_col", Q.value(0)).toSQL(flavor);
      expect(result).toEqual("IFNULL(`nullable_col`,0)");
    });

    it("should handle string fallback", () => {
      const result = Fn.ifnull("name", Q.S`Unknown`).toSQL(flavor);
      expect(result).toEqual("IFNULL(`name`,'Unknown')");
    });

    it("should work with nested functions", () => {
      const result = Fn.ifnull(
        Fn.concat("firstName", Q.S` `, "lastName"),
        Q.S`Unknown`
      ).toSQL(flavor);
      expect(result).toEqual(
        "IFNULL(CONCAT(`firstName`,' ',`lastName`),'Unknown')"
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
        "SUM(IIF(`tax_date` BETWEEN '2020-01-01' AND '2020-01-31', `amount`, 0))"
      );
    });

    it("should handle IFNULL(CONCAT(...))", () => {
      const result = Fn.ifnull(
        Fn.concat(Fn.year("date"), Q.S`-`, Fn.month("date")),
        Q.S`N/A`
      ).toSQL(flavor);
      expect(result).toEqual(
        "IFNULL(CONCAT(strftime('%Y', `date`, 'localtime'),'-',strftime('%m', `date`, 'localtime')),'N/A')"
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
        "SUM(IIF(`tax_date` BETWEEN '2020-01-01' AND '2020-01-31', `price_last_year`, '0'))"
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
  });

  describe("Full query generation", () => {
    it("should generate valid SQLite SELECT query", () => {
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

    it("should generate valid SQLite query with functions", () => {
      const query = Q.select()
        .addField(Fn.year("created_at"), "year")
        .addField(Fn.sum("amount"), "total")
        .from("transactions")
        .groupBy("year");

      const sql = query.toSQL(flavor);
      expect(sql).toContain("strftime('%Y', `created_at`, 'localtime')");
      expect(sql).toContain("SUM(`amount`)");
    });

    it("should render correct select with all features", () => {
      const query = Q.select()
        .addField("foo", "blah")
        .addField(Fn.max("foo"), "blahMax")
        .from("table")
        .where(Cond.equal("foo", 123))
        .where(Cond.equal("blah", "hello"))
        .orderBy("foo", "DESC")
        .limit(100)
        .offset(2);
      expect(query.toSQL(flavor)).toEqual(
        "SELECT `foo` AS `blah`, MAX(`foo`) AS `blahMax` FROM `table` WHERE `foo` = 123 AND `blah` = 'hello' ORDER BY `foo` DESC LIMIT 100 OFFSET 2"
      );
    });

    it("should render query with date and conditional functions", () => {
      const query = Q.select()
        .addField(Fn.month("date"), "month")
        .addField(Fn.year("date"), "year")
        .addField(Fn.if(Cond.lessThan("foo", 5), "foo", "blah"), "blah")
        .from("table");
      expect(query.toSQL(flavor)).toEqual(
        "SELECT strftime('%m', `date`, 'localtime') AS `month`, strftime('%Y', `date`, 'localtime') AS `year`, IIF(`foo` < 5, `foo`, `blah`) AS `blah` FROM `table`"
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle NULL values", () => {
      const result = Cond.isNull("column").toSQL(flavor);
      expect(result).toEqual("`column` IS NULL");
    });

    it("should handle empty strings", () => {
      const result = Cond.equal("column", "").toSQL(flavor);
      expect(result).toEqual("`column` = ''");
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
  });
});
