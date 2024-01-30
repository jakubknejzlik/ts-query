import { Cond } from "./Condition";
import { Fn } from "./Function";
import { Q } from "./Query";

const flavor = Q.flavors.mysql;

describe("Expression", () => {
  it("should produce valid SQL", () => {
    expect(Fn.sum("foo").toSQL(flavor)).toEqual("SUM(`foo`)");
    expect(Fn.max("foo").toSQL(flavor)).toEqual("MAX(`foo`)");
    expect(Fn.ifnull("foo", `123`).toSQL(flavor)).toEqual("IFNULL(`foo`,123)");
    expect(Fn.ifnull("foo", Q.S`123`).toSQL(flavor)).toEqual(
      'IFNULL(`foo`,"123")'
    );
    expect(
      Fn.dateDiff("year", "2024-01-01", "2025-01-01").toSQL(flavor)
    ).toEqual("YEAR(`2024-01-01`) - YEAR(`2025-01-01`)");
  });
  it("should support value composition", () => {
    expect(Fn.sum(Fn.ifnull("foo", Q.S`123`)).toSQL(flavor)).toEqual(
      'SUM(IFNULL(`foo`,"123"))'
    );
    expect(Fn.sum(Fn.ifnull("foo", Q.S`123`)).toSQL(flavor)).toEqual(
      'SUM(IFNULL(`foo`,"123"))'
    );
    expect(
      Fn.sum(Fn.if(Cond.equal("foo_blah", 123), "aa", 123)).toSQL(flavor)
    ).toEqual("SUM(IF(`foo_blah` = 123,`aa`,`123`))");
  });
});
