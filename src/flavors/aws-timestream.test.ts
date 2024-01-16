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
      .orderBy("foo", "DESC");
    expect(query.toSQL(flavor)).toEqual(
      `SELECT "foo" AS "blah", MAX(foo) AS "blahMax" FROM "table" WHERE "foo" = 123 AND "blah" = 'hello' ORDER BY "foo" DESC`
    );
  });
});
