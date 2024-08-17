import { Cond } from "../Condition";
import { Fn } from "../Function";
import { Q } from "../Query";
import { DefaultFlavor } from "./default";

const flavor = Q.flavors.sqlite;

describe("SQLite Flavor flavor", () => {
  it("should render correct select", () => {
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
  it("should render correct update", () => {
    const query = Q.update("table").set({ foo: `'aa'xx"` });
    expect(query.toSQL(flavor)).toEqual(
      "UPDATE `table` SET `foo` = '''aa''xx\"'"
    );
  });
});
