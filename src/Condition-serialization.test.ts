import dayjs, { Dayjs } from "dayjs";
import { Condition, Conditions } from "./Condition";
import { Q } from "./Query";

const flavor = Q.flavors.mysql;

describe("Condition Serialization and Deserialization", () => {
  // EQUAL
  it("should serialize and deserialize equal condition", () => {
    const condition = Conditions.equal("foo", 123);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });
  it("should serialize and deserialize equal condition multiple times", () => {
    const condition = Conditions.equal("foo", 123);
    const serialized = Condition.fromJSON(condition.toJSON()).toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // NOT EQUAL
  it("should serialize and deserialize notEqual condition", () => {
    const condition = Conditions.notEqual("foo", 123);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // GREATER THAN
  it("should serialize and deserialize greaterThan condition", () => {
    const condition = Conditions.greaterThan("foo", 123);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // LESS THAN
  it("should serialize and deserialize lessThan condition", () => {
    const condition = Conditions.lessThan("foo", 123);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // BETWEEN
  it("should serialize and deserialize between condition", () => {
    const condition = Conditions.between("foo", ["abcd", 2]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));

    const json = {
      type: "BetweenCondition",
      key: "foo",
      from: "abcd",
      to: 2,
    };
    expect(Condition.fromJSON(json).toSQL(flavor)).toEqual(
      condition.toSQL(flavor)
    );
  });
  it("should serialize and deserialize between with expressions", () => {
    const condition = Conditions.between("foo", ["abcd", Q.raw("now()")]);
    const json = condition.toJSON();
    expect(Condition.fromJSON(json).toSQL(flavor)).toEqual(
      condition.toSQL(flavor)
    );
  });
  it("should serialize and deserialize between with date", () => {
    const condition = Conditions.between("foo", [
      dayjs().startOf("day"),
      dayjs().endOf("day").toDate(),
    ]);
    const json = condition.toJSON();
    expect(Condition.fromJSON(json).toSQL(flavor)).toEqual(
      condition.toSQL(flavor)
    );
  });

  // IN
  it("should serialize and deserialize in condition", () => {
    const condition = Conditions.in("foo", [1, 2, 3]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // AND
  it("should serialize and deserialize and condition", () => {
    const condition1 = Conditions.equal("foo", 123);
    const condition2 = Conditions.greaterThan("bar", Q.raw("a"));
    const condition = Conditions.and([condition1, condition2]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // OR
  it("should serialize and deserialize or condition", () => {
    const condition1 = Conditions.equal("foo", 123);
    const condition2 = Conditions.lessThan("bar", 50);
    const condition = Conditions.or([condition1, condition2]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // NULL
  it("should serialize and deserialize null condition", () => {
    const condition = Conditions.null("foo");
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // NOT NULL
  it("should serialize and deserialize notNull condition", () => {
    const condition = Conditions.notNull("foo");
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // LIKE
  it("should serialize and deserialize like condition", () => {
    const condition = Conditions.like("foo", "He_lo wor%");
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  // NOT LIKE
  it("should serialize and deserialize notLike condition", () => {
    const condition = Conditions.notLike("foo", "He_lo wor%");
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });
});
