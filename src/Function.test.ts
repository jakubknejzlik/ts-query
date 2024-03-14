import { Cond } from "./Condition";
import { Fn } from "./Function";
import { Q } from "./Query";

const flavor = Q.flavors.mysql;

describe("Expression", () => {
  it("should produce valid SQL", () => {
    expect(Fn.count("*").toSQL(flavor)).toEqual("COUNT(*)");
    expect(Fn.count("foo").toSQL(flavor)).toEqual("COUNT(`foo`)");
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
    expect(Fn.ifnull("foo", Q.value(123)).toSQL(flavor)).toEqual(
      "IFNULL(`foo`,123)"
    );
    expect(Fn.ifnull("foo", Q.S`123`).toSQL(flavor)).toEqual(
      'IFNULL(`foo`,"123")'
    );
    expect(
      Fn.dateDiff("year", Q.value("2024-01-01"), Q.value("2025-01-01")).toSQL(
        flavor
      )
    ).toEqual('(YEAR("2024-01-01") - YEAR("2025-01-01"))');
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

    expect(
      Fn.sum(
        Fn.if(
          Cond.between(`tax_date`, ["2020-01-01", "2020-01-31"]),
          "price_last_year",
          Fn.string(`0`)
        )
      ).toSQL(flavor)
    ).toEqual(
      'SUM(IF(`tax_date` BETWEEN "2020-01-01" AND "2020-01-31",`price_last_year`,"0"))'
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

    const fn3 = Q.select().addField(
      Fn.sum(
        Fn.if(
          Cond.between(`tax_date`, ["2020-01-01", "2020-01-31"]),
          "price_last_year",
          Fn.string(`0`)
        )
      ),
      "blah"
    );

    expect(Q.deserialize(fn3.serialize()).toSQL(flavor)).toEqual(
      fn3.toSQL(flavor)
    );

    const fn4 = Q.select().addField(
      Fn.priceCurrentAndPreviousDiffField({
        thisYearColumn: Fn.sum("price_this_year"),
        lastYearColumn: Fn.avg("price_last_year"),
      }),
      "blah"
    );
    expect(fn4.toSQL(flavor)).toEqual(
      "SELECT IF((SUM(`price_this_year`) = 0 AND AVG(`price_last_year`) = 0),+0,IF(AVG(`price_last_year`) = 0,NULL,IF(SUM(`price_this_year`) = 0,-1,((SUM(`price_this_year`) - AVG(`price_last_year`)) / AVG(`price_last_year`))))) AS `blah` "
    );
    expect(Q.deserialize(fn4.serialize()).toSQL(flavor)).toEqual(
      fn4.toSQL(flavor)
    );
  });
  it("should support serialization for ifnull", () => {
    const fn = Q.select().addField(
      Fn.ifnull(Fn.if(Cond.equal("foo_blah", 123), "aa", Q.value(123)), "blah"),
      "blah"
    );
    expect(fn.toSQL(flavor)).toEqual(
      "SELECT IFNULL(IF(`foo_blah` = 123,`aa`,123),`blah`) AS `blah` "
    );
    expect(Q.deserialize(fn.serialize()).toSQL(flavor)).toEqual(
      fn.toSQL(flavor)
    );
  });
  it("datediff", () => {
    expect(Fn.dateDiff("day", "a", "b").toSQL(flavor)).toEqual(
      "DATEDIFF(`a`,`b`)"
    );
    expect(Fn.dateDiff("month", "a", "b").toSQL(flavor)).toEqual(
      "TIMESTAMPDIFF(MONTH, `a`, `b`)"
    );
    expect(Fn.dateDiff("year", "a", "b").toSQL(flavor)).toEqual(
      "(YEAR(`a`) - YEAR(`b`))"
    );
  });

  it("complex functions", () => {
    expect(Fn.if(Cond.lessThan("a", 30), "a", "b").toSQL(flavor)).toEqual(
      "IF(`a` < 30,`a`,`b`)"
    );
  });
});
