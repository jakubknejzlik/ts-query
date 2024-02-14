import { Cond } from "./Condition";
import { Fn } from "./Function";
import { Q } from "./Query";

const flavor = Q.flavors.mysql;

describe("Expression", () => {
  it("should produce valid SQL", () => {
    expect(Fn.sum("foo").toSQL(flavor)).toEqual("SUM(`foo`)");
    expect(Fn.max("foo").toSQL(flavor)).toEqual("MAX(`foo`)");
    expect(Fn.add("foo", "blah").toSQL(flavor)).toEqual("(`foo` + `blah`)");
    expect(Fn.subtract("foo", "blah").toSQL(flavor)).toEqual(
      "(`foo` - `blah`)"
    );
    expect(Fn.multiply("foo", "blah").toSQL(flavor)).toEqual(
      "(`foo` * `blah`)"
    );
    expect(Fn.divide("foo", "blah").toSQL(flavor)).toEqual("(`foo` / `blah`)");
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
    expect(Fn.sum(Fn.ifnull("foo", `-123`)).toSQL(flavor)).toEqual(
      "SUM(IFNULL(`foo`,-123))"
    );
    expect(
      Fn.sum(Fn.if(Cond.equal("foo_blah", 123), "aa", 123)).toSQL(flavor)
    ).toEqual("SUM(IF(`foo_blah` = 123,`aa`,`123`))");
    expect(
      Fn.if(Cond.equal("foo_blah", 123), "aa", Q.expr(-123)).toSQL(flavor)
    ).toEqual("IF(`foo_blah` = 123,`aa`,-123)");
    expect(
      Fn.dateRangeSumField({
        dateColumn: "tax_date",
        valueColumn: "amount",
        start: "2020-01-01",
        end: "2020-01-31",
      }).toSQL(flavor)
    ).toEqual(
      'SUM(IF(`tax_date` BETWEEN "2020-01-01" AND "2020-01-31",`amount`,0))'
    );
  });
  it("should support serialization for functions", () => {
    const serialized =
      '{"type":"SelectQuery","tables":[],"unionQueries":[],"joins":[],"fields":[{"name":"SUM(YEAR(#foo#))"}],"where":[],"having":[],"orderBy":[],"groupBy":[]}';

    const fn = Q.select().addField(Fn.sum(Fn.year("foo")));
    const fn2 = Q.deserialize(serialized);
    // console.log("serialized test:", JSON.stringify(fn.serialize()));

    expect(fn2.toSQL(flavor)).toEqual(fn.toSQL(flavor));
  });
  it("should support serialization for operations", () => {
    const serialized =
      '{"type":"SelectQuery","tables":[],"unionQueries":[],"joins":[],"fields":[{"name":"((#foo# / #blah#) + #xyz#)"}],"where":[],"having":[],"orderBy":[],"groupBy":[]}';

    const fn = Q.select().addField(Fn.add(Fn.divide("foo", "blah"), "xyz"));
    const fn2 = Q.deserialize(serialized);
    // console.log("serialized test:", JSON.stringify(fn.serialize()));

    expect(fn2.toSQL(flavor)).toEqual(fn.toSQL(flavor));
  });
});
