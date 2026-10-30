import { Cond } from "../Condition";
import { Fn } from "../Function";
import { Q } from "../Query";
import { FunctionExpression } from "../Expression";
import { inlineBindings } from "../test-bindings";

const flavor = Q.flavors.postgres;

describe("PostgresFlavor", () => {
  describe("bound literal casts", () => {
    it("types CONCAT literals beside columns and preserves binding order", () => {
      const query = Q.select()
        .from("t", "m")
        .field(Fn.concat("m.first_name", Q.value(" "), "m.last_name"), "name")
        .where(Cond.equal("m.active", true));
      expect(query.toSQLWithBindings(flavor)).toEqual({
        sql: 'SELECT CONCAT("m"."first_name",CAST($1 AS TEXT),"m"."last_name") AS "name" FROM "t" AS "m" WHERE "m"."active" = $2',
        bindings: [" ", true],
      });
      expect(query.toSQL(flavor)).toBe(
        'SELECT CONCAT("m"."first_name",\' \',"m"."last_name") AS "name" FROM "t" AS "m" WHERE "m"."active" = true'
      );
    });

    it("types all-literal functions, operations and CASE results only", () => {
      const query = Q.select()
        .field(new FunctionExpression("LOWER", Q.value("X")), "lower")
        .field(Fn.multiply(Q.value(2), Q.value(3)), "product")
        .field(
          Fn.sum(Fn.if(Cond.equal("active", true), Q.value(1), Q.value(0))),
          "total"
        );
      expect(query.toSQLWithBindings(flavor)).toEqual({
        sql: 'SELECT LOWER(CAST($1 AS TEXT)) AS "lower", ($2::integer * $3::integer) AS "product", SUM(CASE WHEN "active" = $4 THEN $5::integer ELSE $6::integer END) AS "total" ',
        bindings: ["X", 2, 3, true, 1, 0],
      });
      expect(
        Fn.if(
          Cond.equal("active", true),
          Q.value("a"),
          Q.value("b")
        ).toSQLWithBindings(flavor)
      ).toEqual({
        sql: 'CASE WHEN "active" = $1 THEN CAST($2 AS TEXT) ELSE CAST($3 AS TEXT) END',
        bindings: [true, "a", "b"],
      });
    });

    it("leaves literals untyped beside column siblings", () => {
      const query = Q.select()
        .field(Fn.ifnull("amount", Q.value(0)))
        .field(Fn.ifnull("col", Q.value("x")))
        .field(Fn.multiply("price", Q.value(2)))
        .field(Fn.if(Cond.equal("active", true), Q.value("a"), "col"));
      expect(query.toSQLWithBindings(flavor)).toEqual({
        sql: 'SELECT COALESCE("amount",$1), COALESCE("col",$2), ("price" * $3), CASE WHEN "active" = $4 THEN $5 ELSE "col" END ',
        bindings: [0, "x", 2, true, "a"],
      });
    });

    it("leaves literals untyped beside subquery and nested expression siblings", () => {
      expect(
        Q.select()
          .field(
            Fn.ifnull(Q.raw('(SELECT MAX("amount") FROM "t")'), Q.value("0"))
          )
          .field(Fn.ifnull(Fn.sum("amount"), Q.value("0")))
          .field(Fn.add(Fn.abs("price"), Q.value(1)))
          .toSQLWithBindings(flavor)
      ).toEqual({
        sql: 'SELECT COALESCE((SELECT MAX("amount") FROM "t"),$1), COALESCE(SUM("amount"),$2), (ABS("price") + $3) ',
        bindings: ["0", "0", 1],
      });
    });

    it.each([
      { name: "string", value: "x", sql: "CAST($1 AS TEXT)" },
      { name: "int32 minimum", value: -2147483648, sql: "$1::integer" },
      { name: "int32 maximum", value: 2147483647, sql: "$1::integer" },
      { name: "below int32", value: -2147483649, sql: "$1::bigint" },
      { name: "above int32", value: 2147483648, sql: "$1::bigint" },
      { name: "bigint", value: BigInt("2147483648"), sql: "$1::bigint" },
      { name: "fraction", value: 1.5, sql: "$1::numeric" },
      { name: "true", value: true, sql: "$1::boolean" },
      { name: "false", value: false, sql: "$1::boolean" },
      { name: "null", value: null, sql: "$1" },
      {
        name: "Date (#22)",
        value: new Date("2024-01-01T00:00:00Z"),
        sql: "$1",
      },
    ])("renders a bare $name field with its agreed type", ({ value, sql }) => {
      const query = Q.select().field(Q.value(value), "value");
      expect(query.toSQLWithBindings(flavor)).toEqual({
        sql: `SELECT ${sql} AS "value" `,
        bindings: [value],
      });
      expect(query.toSQL(flavor)).toBe(
        `SELECT ${flavor.escapeValue(value)} AS "value" `
      );
    });

    it("keeps conditions, JOIN ON, HAVING and direct grouping/ordering values untyped", () => {
      expect(
        Q.select()
          .from("t")
          .join(Q.table("u"), Cond.equal("u.id", "uuid"))
          .where(Cond.equal("amount", 1))
          .where(Cond.in("status", ["a", "b"]))
          .where(Cond.between("price", [1, 2]))
          .where(Cond.like("col", "%x%"))
          .where(Cond.like("col", "%X%", { caseInsensitive: true }))
          .groupBy(Q.value(1))
          .having(Cond.greaterThan(Fn.sum("price"), 0))
          .orderBy(Q.value(1))
          .limit(2)
          .offset(1)
          .toSQLWithBindings(flavor)
      ).toEqual({
        sql: 'SELECT * FROM "t" INNER JOIN "u" ON "u"."id" = $1 WHERE "amount" = $2 AND "status" IN ($3, $4) AND "price" BETWEEN $5 AND $6 AND "col" LIKE $7 AND "col" ILIKE $8 GROUP BY $9 HAVING SUM("price") > $10 ORDER BY $11 ASC LIMIT $12 OFFSET $13',
        bindings: ["uuid", 1, "a", "b", 1, 2, "%x%", "%X%", 1, 0, 1, 2, 1],
      });
    });

    it("strips binding casts before substitution and preserves user SQL casts", () => {
      const query = Q.select()
        .field(Q.raw("CAST('x' AS TEXT)"))
        .field(Q.raw("1::integer"))
        .field(Q.value("CAST($1 AS TEXT) $2::integer 'quoted'"))
        .field(Q.value(2));
      expect(inlineBindings(query.toSQLWithBindings(flavor), flavor)).toBe(
        query.toSQL(flavor)
      );
      expect(query.toSQL(flavor)).toBe(
        "SELECT CAST('x' AS TEXT), 1::integer, 'CAST($1 AS TEXT) $2::integer ''quoted''', 2 "
      );
    });

    it("keeps an authored CAST($1 AS TEXT) beside a generated cast", () => {
      const result = Q.select()
        .field(Q.value("x"))
        .field(Q.raw("CAST($1 AS TEXT)"))
        .field(Q.raw("$1::integer"))
        .toSQLWithBindings(flavor);
      expect(inlineBindings(result, flavor)).toBe(
        "SELECT 'x', CAST('x' AS TEXT), 'x'::integer "
      );
    });

    it("rejects a generated cast in a condition slot", () => {
      const condition = Cond.equal("n", 2);
      const original = condition.toSQL;
      // Simulate a renderer regression while retaining a valid SELECT cast.
      condition.toSQL = function (flavor, options) {
        const sql = original.call(this, flavor, options);
        return flavor.bindValue ? `${sql}::integer` : sql;
      };
      const query = Q.select().field(Q.value(1)).from("t").where(condition);
      expect(query.toSQLWithBindings(flavor).sql).toBe(
        'SELECT $1::integer FROM "t" WHERE "n" = $2::integer'
      );
      expect(() => query.toSQL(flavor)).toThrow();
    });

    it.each(["mysql", "sqlite", "awsTimestream"] as const)(
      "preserves %s inline and bound output byte for byte",
      (name) => {
        const other = Q.flavors[name];
        const quote = name === "awsTimestream" ? '"' : "`";
        const stringQuote = name === "mysql" ? '"' : "'";
        const query = Q.select()
          .field(Q.value(1))
          .field(Fn.multiply(Q.value(2), Q.value(3)))
          .field(Fn.concat("name", Q.value("x")));
        expect(query.toSQLWithBindings(other)).toEqual({
          sql: `SELECT ?, (? * ?), CONCAT(${quote}name${quote},?) `,
          bindings: [1, 2, 3, "x"],
        });
        expect(query.toSQL(other)).toBe(
          `SELECT 1, (2 * 3), CONCAT(${quote}name${quote},${stringQuote}x${stringQuote}) `
        );
      }
    );
  });

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
