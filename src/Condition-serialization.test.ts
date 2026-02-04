import dayjs from "dayjs";
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

  it("should serialize and deserialize in condition with strings", () => {
    const condition = Conditions.in("type", ["IncomingInvoice", "ExpenditureCashSlip"]);
    const serialized = condition!.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition!.toSQL(flavor));
    expect(deserialized.toSQL(flavor)).toEqual(
      '`type` IN ("IncomingInvoice", "ExpenditureCashSlip")'
    );
  });

  // NOT IN
  it("should serialize and deserialize notIn condition", () => {
    const condition = Conditions.notIn("foo", [1, 2, 3]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  it("should serialize and deserialize notIn condition with strings", () => {
    const condition = Conditions.notIn("type", ["IncomingInvoice", "ExpenditureCashSlip"]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
    // Verify the fix: strings should be quoted as values, not treated as columns
    expect(deserialized.toSQL(flavor)).toEqual(
      '`type` NOT IN ("IncomingInvoice", "ExpenditureCashSlip")'
    );
  });

  it("should handle round-trip serialization of notIn condition", () => {
    const condition = Conditions.notIn("status", ["deleted", "banned"]);
    const firstSerialized = condition.toJSON();
    const firstDeserialized = Condition.fromJSON(firstSerialized);
    const secondSerialized = firstDeserialized.toJSON();
    const secondDeserialized = Condition.fromJSON(secondSerialized);
    expect(secondDeserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
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

  // NOT
  it("should serialize and deserialize not condition", () => {
    const condition = Conditions.not(Conditions.equal("foo", 123));
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  it("should serialize and deserialize complex not condition", () => {
    const andCondition = Conditions.and([
      Conditions.equal("foo", 123),
      Conditions.greaterThan("bar", 50),
    ]);
    const condition = Conditions.not(andCondition!);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  it("should serialize and deserialize nested not condition", () => {
    const innerNot = Conditions.not(Conditions.equal("foo", 123));
    const condition = Conditions.not(innerNot);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });

  it("should handle round-trip serialization of not condition", () => {
    const condition = Conditions.not(Conditions.in("foo", [1, 2, 3])!);
    const firstSerialized = condition.toJSON();
    const firstDeserialized = Condition.fromJSON(firstSerialized);
    const secondSerialized = firstDeserialized.toJSON();
    const secondDeserialized = Condition.fromJSON(secondSerialized);
    expect(secondDeserialized.toSQL(flavor)).toEqual(condition.toSQL(flavor));
  });
});
