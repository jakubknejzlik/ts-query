import { Condition, Conditions } from './Condition';

describe('Condition Serialization and Deserialization', () => {
  // EQUAL
  it('should serialize and deserialize equal condition', () => {
    const condition = Conditions.equal('foo', 123);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // NOT EQUAL
  it('should serialize and deserialize notEqual condition', () => {
    const condition = Conditions.notEqual('foo', 123);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // GREATER THAN
  it('should serialize and deserialize greaterThan condition', () => {
    const condition = Conditions.greaterThan('foo', 123);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // LESS THAN
  it('should serialize and deserialize lessThan condition', () => {
    const condition = Conditions.lessThan('foo', 123);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // BETWEEN
  it('should serialize and deserialize between condition', () => {
    const condition = Conditions.between('foo', [1, 2]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // IN
  it('should serialize and deserialize in condition', () => {
    const condition = Conditions.in('foo', [1, 2, 3]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // AND
  it('should serialize and deserialize and condition', () => {
    const condition1 = Conditions.equal('foo', 123);
    const condition2 = Conditions.greaterThan('bar', 50);
    const condition = Conditions.and([condition1, condition2]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // OR
  it('should serialize and deserialize or condition', () => {
    const condition1 = Conditions.equal('foo', 123);
    const condition2 = Conditions.lessThan('bar', 50);
    const condition = Conditions.or([condition1, condition2]);
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // NULL
  it('should serialize and deserialize null condition', () => {
    const condition = Conditions.null('foo');
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // NOT NULL
  it('should serialize and deserialize notNull condition', () => {
    const condition = Conditions.notNull('foo');
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // LIKE
  it('should serialize and deserialize like condition', () => {
    const condition = Conditions.like('foo', 'He_lo wor%');
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });

  // NOT LIKE
  it('should serialize and deserialize notLike condition', () => {
    const condition = Conditions.notLike('foo', 'He_lo wor%');
    const serialized = condition.toJSON();
    const deserialized = Condition.fromJSON(serialized);
    expect(deserialized.toSQL()).toEqual(condition.toSQL());
  });
});
