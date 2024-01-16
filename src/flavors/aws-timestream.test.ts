import { Cond } from "../Condition";
import { Q } from "../Query";

const flavor = Q.flavors.awsTimestream;

describe("Query builder AWS Timestream flavor", () => {
  it("should render correct SQL", () => {
    const query = Q.select()
      .addField("foo", "blah")
      .from("table")
      .where(Cond.equal("foo", 123))
      .where(Cond.equal("blah", "hello"))
      .orderBy("foo", "DESC");
    expect(query.toSQL(flavor)).toEqual(
      `SELECT "foo" AS "blah" FROM "table" WHERE "foo" = 123 AND "blah" = 'hello' ORDER BY "foo" DESC`
    );
  });
});
