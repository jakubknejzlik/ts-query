import dayjs from "dayjs";
import { Cond } from "./Condition";
import { Fn } from "./Function";
import { Q } from "./Query";

const flavor = Q.flavors.mysql;

describe("Condition", () => {
  // EQUAL
  it("should format equal", () => {
    expect(Cond.equal("foo", 123).toSQL(flavor)).toEqual("`foo` = 123");
    expect(Cond.equal("foo", "123").toSQL(flavor)).toEqual('`foo` = "123"');
  });

  // NOT EQUAL
  it("should format notEqual", () => {
    expect(Cond.notEqual("foo", 123).toSQL(flavor)).toEqual("`foo` != 123");
    expect(Cond.notEqual("foo", "123").toSQL(flavor)).toEqual('`foo` != "123"');
  });

  // GREATER THAN
  it("should format greaterThan", () => {
    expect(Cond.greaterThan("foo", 123).toSQL(flavor)).toEqual("`foo` > 123");
    expect(Cond.greaterThan("foo", "123").toSQL(flavor)).toEqual(
      '`foo` > "123"'
    );
  });

  // LESS THAN
  it("should format lessThan", () => {
    expect(Cond.lessThan("foo", 123).toSQL(flavor)).toEqual("`foo` < 123");
    expect(Cond.lessThan("foo", "123").toSQL(flavor)).toEqual('`foo` < "123"');
  });

  // GREATER THAN OR EQUAL
  it("should format greaterThanOrEqual", () => {
    expect(Cond.greaterThanOrEqual("foo", 123).toSQL(flavor)).toEqual(
      "`foo` >= 123"
    );
    expect(Cond.greaterThanOrEqual("foo", "123").toSQL(flavor)).toEqual(
      '`foo` >= "123"'
    );
  });

  // LESS THAN OR EQUAL
  it("should format lessThanOrEqual", () => {
    expect(Cond.lessThanOrEqual("foo", 123).toSQL(flavor)).toEqual(
      "`foo` <= 123"
    );
    expect(Cond.lessThanOrEqual("foo", "123").toSQL(flavor)).toEqual(
      '`foo` <= "123"'
    );
  });

  // BETWEEN
  it("should format between", () => {
    expect(Cond.between("foo", [1, 2]).toSQL(flavor)).toEqual(
      "`foo` BETWEEN 1 AND 2"
    );
    expect(Cond.between("foo", ["1", 2]).toSQL(flavor)).toEqual(
      '`foo` BETWEEN "1" AND 2'
    );
  });
  it("should format between", () => {
    expect(Cond.between("foo", [1, 2]).toSQL(flavor)).toEqual(
      "`foo` BETWEEN 1 AND 2"
    );
    expect(
      Cond.between("foo", [dayjs("2024-01-01").startOf("year"), 2]).toSQL(
        flavor
      )
    ).toEqual('`foo` BETWEEN "2024-01-01 00:00:00" AND 2');
  });

  // IN
  it("should format in", () => {
    expect(Cond.in("foo", [1, 2, 3])?.toSQL(flavor)).toEqual(
      "`foo` IN (1, 2, 3)"
    );
    expect(Cond.in("foo", ["1", "2", "3"])?.toSQL(flavor)).toEqual(
      '`foo` IN ("1", "2", "3")'
    );
    expect(Cond.in("foo", [])).toBeNull();
    expect(Cond.in("foo", null)).toBeNull();
  });

  // NOT IN
  it("should format notIn", () => {
    expect(Cond.notIn("foo", [1, 2, 3]).toSQL(flavor)).toEqual(
      "`foo` NOT IN (1, 2, 3)"
    );
    // BUG: strings in notIn are treated as column names instead of string literals
    // Expected: '`foo` NOT IN ("1", "2", "3")'
    // Actual: '`foo` NOT IN (`1`, `2`, `3`)' - treats as columns!
    expect(Cond.notIn("foo", ["1", "2", "3"]).toSQL(flavor)).toEqual(
      '`foo` NOT IN ("1", "2", "3")'
    );
  });

  // IN and NOT IN API consistency
  it("should treat string values consistently in both in() and notIn()", () => {
    // Real-world example from the report
    const inResult = Cond.in("type", ["IncomingInvoice", "ExpenditureCashSlip"])?.toSQL(flavor);
    const notInResult = Cond.notIn("type", ["IncomingInvoice", "ExpenditureCashSlip"]).toSQL(flavor);

    // Both should quote strings as values, not treat them as column names
    expect(inResult).toEqual('`type` IN ("IncomingInvoice", "ExpenditureCashSlip")');
    expect(notInResult).toEqual('`type` NOT IN ("IncomingInvoice", "ExpenditureCashSlip")');
  });

  // IN/NOT IN edge cases
  it("should handle single-element arrays", () => {
    expect(Cond.in("foo", ["only_one"])?.toSQL(flavor)).toEqual(
      '`foo` IN ("only_one")'
    );
    expect(Cond.notIn("foo", [42]).toSQL(flavor)).toEqual("`foo` NOT IN (42)");
  });

  it("should handle boolean values in arrays", () => {
    expect(Cond.in("active", [true, false])?.toSQL(flavor)).toEqual(
      "`active` IN (true, false)"
    );
    expect(Cond.notIn("active", [true]).toSQL(flavor)).toEqual(
      "`active` NOT IN (true)"
    );
  });

  it("should handle Date objects in arrays", () => {
    const date1 = new Date("2024-01-15T10:30:00Z");
    const date2 = new Date("2024-06-20T14:00:00Z");
    const inResult = Cond.in("created_at", [date1, date2])?.toSQL(flavor);
    expect(inResult).toContain("`created_at` IN (");
    expect(inResult).toContain("2024-01-15");
    expect(inResult).toContain("2024-06-20");
  });

  it("should handle dayjs objects in arrays", () => {
    const day1 = dayjs("2024-01-01");
    const day2 = dayjs("2024-12-31");
    const inResult = Cond.in("date", [day1, day2])?.toSQL(flavor);
    expect(inResult).toContain("`date` IN (");
    expect(inResult).toContain("2024-01-01");
    expect(inResult).toContain("2024-12-31");
  });

  it("should handle Q.raw() expressions in arrays", () => {
    expect(Cond.in("col", [Q.raw("NOW()"), Q.raw("CURDATE()")])?.toSQL(flavor)).toEqual(
      "`col` IN (NOW(), CURDATE())"
    );
    expect(Cond.notIn("col", [Q.raw("NULL")])?.toSQL(flavor)).toEqual(
      "`col` NOT IN (NULL)"
    );
  });

  it("should not allow FunctionExpression in arrays (use Q.raw instead)", () => {
    // FunctionExpression cannot be used as a value - this is by design
    expect(() => Cond.in("col", [Fn.max("price")])).toThrow(
      "FunctionExpression cannot be used as a value"
    );
    // Use Q.raw() for function calls in IN/NOT IN
    expect(Cond.in("col", [Q.raw("MAX(price)")])?.toSQL(flavor)).toEqual(
      "`col` IN (MAX(price))"
    );
  });

  it("should handle explicit column references with Q.raw()", () => {
    // When user explicitly wants column references, they can use Q.raw()
    expect(Cond.in("col", [Q.raw("other_col"), Q.raw("another")])?.toSQL(flavor)).toEqual(
      "`col` IN (other_col, another)"
    );
  });

  it("should handle double negation with not(notIn())", () => {
    expect(Cond.not(Cond.notIn("foo", [1, 2, 3])).toSQL(flavor)).toEqual(
      "NOT (`foo` NOT IN (1, 2, 3))"
    );
    expect(Cond.not(Cond.notIn("type", ["a", "b"])).toSQL(flavor)).toEqual(
      'NOT (`type` NOT IN ("a", "b"))'
    );
  });

  // AND
  it("should format and", () => {
    const condition1 = Cond.equal("foo", 123);
    const condition2 = Cond.greaterThan("bar", 50);
    expect(Cond.and([condition1, condition2])?.toSQL(flavor)).toEqual(
      "(`foo` = 123 AND `bar` > 50)"
    );
    expect(Cond.and([])).toBeNull();
    expect(Cond.and(null)).toBeNull();
    expect(Cond.and([null])).toBeNull();
    expect(Cond.and([Cond.or([])])).toBeNull();
  });

  // OR
  it("should format or", () => {
    const condition1 = Cond.equal("foo", 123);
    const condition2 = Cond.lessThan("bar", 50);
    expect(Cond.or([condition1, condition2])?.toSQL(flavor)).toEqual(
      "(`foo` = 123 OR `bar` < 50)"
    );
    expect(Cond.or([])).toBeNull();
    expect(Cond.or(null)).toBeNull();
    expect(Cond.or([null])).toBeNull();
    expect(Cond.or([Cond.and([])])).toBeNull();
  });

  // NULL
  it("should format null", () => {
    expect(Cond.null("foo").toSQL(flavor)).toEqual("`foo` IS NULL");
  });

  // NOT NULL
  it("should format not null", () => {
    expect(Cond.notNull("foo").toSQL(flavor)).toEqual("`foo` IS NOT NULL");
  });

  // IS NULL
  it("should format isNull", () => {
    expect(Cond.isNull("foo").toSQL(flavor)).toEqual("`foo` IS NULL");
  });

  // IS NOT NULL
  it("should format isNotNull", () => {
    expect(Cond.isNotNull("foo").toSQL(flavor)).toEqual("`foo` IS NOT NULL");
  });

  // LIKE
  it("should format like", () => {
    expect(Cond.like("foo", "He_lo wor%").toSQL(flavor)).toEqual(
      '`foo` LIKE "He_lo wor%"'
    );
  });

  // NOT LIKE
  it("should format like", () => {
    expect(Cond.notLike("foo", "He_lo wor%").toSQL(flavor)).toEqual(
      '`foo` NOT LIKE "He_lo wor%"'
    );
  });

  // NOT
  it("should format not", () => {
    expect(Cond.not(Cond.equal("foo", 123)).toSQL(flavor)).toEqual(
      "NOT (`foo` = 123)"
    );
    expect(Cond.not(Cond.greaterThan("bar", 50)).toSQL(flavor)).toEqual(
      "NOT (`bar` > 50)"
    );
  });

  it("should format not with complex conditions", () => {
    const andCondition = Cond.and([
      Cond.equal("foo", 123),
      Cond.greaterThan("bar", 50),
    ]);
    expect(Cond.not(andCondition!).toSQL(flavor)).toEqual(
      "NOT ((`foo` = 123 AND `bar` > 50))"
    );

    const orCondition = Cond.or([
      Cond.equal("foo", 123),
      Cond.lessThan("bar", 50),
    ]);
    expect(Cond.not(orCondition!).toSQL(flavor)).toEqual(
      "NOT ((`foo` = 123 OR `bar` < 50))"
    );
  });

  it("should format nested not conditions", () => {
    const notCondition = Cond.not(Cond.equal("foo", 123));
    expect(Cond.not(notCondition).toSQL(flavor)).toEqual(
      "NOT (NOT (`foo` = 123))"
    );
  });

  it("should format not with other condition types", () => {
    expect(Cond.not(Cond.null("foo")).toSQL(flavor)).toEqual(
      "NOT (`foo` IS NULL)"
    );
    expect(Cond.not(Cond.in("foo", [1, 2, 3])!).toSQL(flavor)).toEqual(
      "NOT (`foo` IN (1, 2, 3))"
    );
    expect(Cond.not(Cond.between("foo", [1, 10])).toSQL(flavor)).toEqual(
      "NOT (`foo` BETWEEN 1 AND 10)"
    );
    expect(Cond.not(Cond.like("foo", "%test%")).toSQL(flavor)).toEqual(
      'NOT (`foo` LIKE "%test%")'
    );
  });
});

describe("Conditions.fromString", () => {
  it("should handle an empty array condition", () => {
    const condition = Cond.fromString("column", "");
    expect(condition!.toSQL(flavor)).toEqual('`column` = ""');
  });

  it("should handle a single condition string", () => {
    const condition = Cond.fromString("column", ">=10");
    expect(condition!.toSQL(flavor)).toEqual('`column` >= "10"');
  });

  it("should handle different operators", () => {
    expect(Cond.fromString("column", ">10")!.toSQL(flavor)).toEqual(
      '`column` > "10"'
    );
    expect(Cond.fromString("column", "<=20")!.toSQL(flavor)).toEqual(
      '`column` <= "20"'
    );
    expect(Cond.fromString("column", "~value")!.toSQL(flavor)).toMatch(/LIKE/);
  });

  it("should default to equal condition", () => {
    const condition = Cond.fromString("column", "value");
    expect(condition!.toSQL(flavor)).toEqual('`column` = "value"');
  });

  it("should use default space delimiter for ~ operator", () => {
    const condition = Cond.fromString("column", "~test");
    const sql = condition!.toSQL(flavor);
    expect(sql).toContain('`column` LIKE "test%"');
    expect(sql).toContain('`column` LIKE "% test%"');
    expect(sql).toMatch(/OR/);
  });

  it("should support multiple delimiters for ~ operator", () => {
    const condition = Cond.fromString("column", "~test", [" ", ","]);
    const sql = condition!.toSQL(flavor);
    expect(sql).toContain('`column` LIKE "test%"');
    expect(sql).toContain('`column` LIKE "% test%"');
    expect(sql).toContain('`column` LIKE "%,test%"');
    expect(sql).toMatch(/OR/);
  });

  it("should support custom delimiters for ~ operator", () => {
    const condition = Cond.fromString("column", "~test", ["-", "_", "."]);
    const sql = condition!.toSQL(flavor);
    expect(sql).toContain('`column` LIKE "test%"');
    expect(sql).toContain('`column` LIKE "%-test%"');
    expect(sql).toContain('`column` LIKE "%_test%"');
    expect(sql).toContain('`column` LIKE "%.test%"');
    expect(sql).toMatch(/OR/);
  });

  it("should use default space delimiter for !~ operator", () => {
    const condition = Cond.fromString("column", "!~test");
    const sql = condition!.toSQL(flavor);
    expect(sql).toContain('`column` NOT LIKE "test%"');
    expect(sql).toContain('`column` NOT LIKE "% test%"');
    expect(sql).toMatch(/AND/);
  });

  it("should support multiple delimiters for !~ operator", () => {
    const condition = Cond.fromString("column", "!~test", [" ", ","]);
    const sql = condition!.toSQL(flavor);
    expect(sql).toContain('`column` NOT LIKE "test%"');
    expect(sql).toContain('`column` NOT LIKE "% test%"');
    expect(sql).toContain('`column` NOT LIKE "%,test%"');
    expect(sql).toMatch(/AND/);
  });

  it("should support custom delimiters for !~ operator", () => {
    const condition = Cond.fromString("column", "!~test", ["-", "_", "."]);
    const sql = condition!.toSQL(flavor);
    expect(sql).toContain('`column` NOT LIKE "test%"');
    expect(sql).toContain('`column` NOT LIKE "%-test%"');
    expect(sql).toContain('`column` NOT LIKE "%_test%"');
    expect(sql).toContain('`column` NOT LIKE "%.test%"');
    expect(sql).toMatch(/AND/);
  });
});

describe("SQL Injection Prevention", () => {
  it("should escape quotes in LIKE patterns", () => {
    const maliciousPattern = "test'; DROP TABLE users; --";
    const sql = Cond.like("column", maliciousPattern).toSQL(flavor);
    // The pattern should be properly escaped and contained within quotes
    expect(sql).toContain("LIKE");
    // The SQL should not allow the injection to break out of the string
    expect(sql).toEqual('`column` LIKE "test\'; DROP TABLE users; --"');
  });

  it("should escape quotes in NOT LIKE patterns", () => {
    const maliciousPattern = 'test"; DELETE FROM users; --';
    const sql = Cond.notLike("column", maliciousPattern).toSQL(flavor);
    // Double quotes should be doubled to prevent injection
    expect(sql).toContain('NOT LIKE "test""; DELETE FROM users; --"');
  });

  it("should escape quotes in LIKE patterns via fromString", () => {
    const maliciousSearch = "~test'; DROP TABLE users; --";
    const condition = Cond.fromString("column", maliciousSearch);
    const sql = condition!.toSQL(flavor);
    // The injection attempt should be contained within the quoted string
    expect(sql).toContain('LIKE "test');
    expect(sql).toContain('DROP TABLE users; --%"');
  });

  it("should escape quotes in IN values", () => {
    const sql = Cond.in("col", ["it's", 'say "hello"'])?.toSQL(flavor);
    // Single quotes should pass through, double quotes should be escaped
    expect(sql).toContain("it's");
    expect(sql).toContain('say ""hello""');
  });

  it("should escape SQL injection attempts in IN values", () => {
    const sql = Cond.in("col", ["'; DROP TABLE x; --"])?.toSQL(flavor);
    // The malicious string should be properly quoted as a value
    expect(sql).toEqual('`col` IN ("\'; DROP TABLE x; --")');
  });

  it("should escape SQL injection attempts in NOT IN values", () => {
    const sql = Cond.notIn("col", ['"; DELETE FROM y; --']).toSQL(flavor);
    // Double quotes should be escaped
    expect(sql).toContain('""; DELETE FROM y; --"');
  });
});
