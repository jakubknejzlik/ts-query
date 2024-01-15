import { Cond } from "../Condition";
import { Q } from "../Query";

const flavor = Q.flavors.awsTimestream;

describe("Query builder AWS Timestream flavor", () => {
  it("should render correct SQL", () => {
    const query = Q.select()
      .from("table")
      .where(Cond.equal("foo", 123))
      .where(Cond.equal("blah", "hello"));
    expect(query.toSQL(flavor)).toEqual(
      `SELECT * FROM "table" WHERE "foo" = 123 AND "blah" = 'hello'`
    );
  });
});
