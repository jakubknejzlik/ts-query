import { Cond } from "../Condition";
import { Fn } from "../Function";
import { Q } from "../Query";

const flavor = Q.flavors.awsTimestream;

describe("Query builder AWS Timestream flavor", () => {
  it("should render correct SQL", () => {
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
      `SELECT "foo" AS "blah", MAX("foo") AS "blahMax" FROM "table" WHERE "foo" = 123 AND "blah" = 'hello' ORDER BY "foo" DESC OFFSET 2 LIMIT 100`
    );
  });

  it("dateadd", () => {
    expect(Fn.dateAdd("date", 12, "year").toSQL(flavor)).toEqual(
      `date_add('year', 12, "date")`
    );
    expect(Fn.dateAdd("date", -12, "day").toSQL(flavor)).toEqual(
      `date_add('day', -12, "date")`
    );
  });
});
