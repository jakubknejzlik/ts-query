import { Cond } from './Condition';

describe('Condition', () => {
  // EQUAL
  it('should format equal', () => {
    expect(Cond.equal('foo', 123).toSQL()).toEqual('`foo` = 123');
    expect(Cond.equal('foo', '123').toSQL()).toEqual('`foo` = "123"');
  });

  // NOT EQUAL
  it('should format notEqual', () => {
    expect(Cond.notEqual('foo', 123).toSQL()).toEqual('`foo` != 123');
    expect(Cond.notEqual('foo', '123').toSQL()).toEqual('`foo` != "123"');
  });

  // GREATER THAN
  it('should format greaterThan', () => {
    expect(Cond.greaterThan('foo', 123).toSQL()).toEqual('`foo` > 123');
    expect(Cond.greaterThan('foo', '123').toSQL()).toEqual('`foo` > "123"');
  });

  // LESS THAN
  it('should format lessThan', () => {
    expect(Cond.lessThan('foo', 123).toSQL()).toEqual('`foo` < 123');
    expect(Cond.lessThan('foo', '123').toSQL()).toEqual('`foo` < "123"');
  });

  // GREATER THAN OR EQUAL
  it('should format greaterThanOrEqual', () => {
    expect(Cond.greaterThanOrEqual('foo', 123).toSQL()).toEqual('`foo` >= 123');
    expect(Cond.greaterThanOrEqual('foo', '123').toSQL()).toEqual(
      '`foo` >= "123"'
    );
  });

  // LESS THAN OR EQUAL
  it('should format lessThanOrEqual', () => {
    expect(Cond.lessThanOrEqual('foo', 123).toSQL()).toEqual('`foo` <= 123');
    expect(Cond.lessThanOrEqual('foo', '123').toSQL()).toEqual(
      '`foo` <= "123"'
    );
  });

  // BETWEEN
  it('should format between', () => {
    expect(Cond.between('foo', [1, 2]).toSQL()).toEqual(
      '`foo` BETWEEN 1 AND 2'
    );
    expect(Cond.between('foo', ['1', 2]).toSQL()).toEqual(
      '`foo` BETWEEN "1" AND 2'
    );
  });

  // IN
  it('should format in', () => {
    expect(Cond.in('foo', [1, 2, 3]).toSQL()).toEqual('`foo` IN (1, 2, 3)');
    expect(Cond.in('foo', ['1', '2', '3']).toSQL()).toEqual(
      '`foo` IN ("1", "2", "3")'
    );
  });

  // AND
  it('should format and', () => {
    const condition1 = Cond.equal('foo', 123);
    const condition2 = Cond.greaterThan('bar', 50);
    expect(Cond.and([condition1, condition2]).toSQL()).toEqual(
      '(`foo` = 123 AND `bar` > 50)'
    );
  });

  // OR
  it('should format or', () => {
    const condition1 = Cond.equal('foo', 123);
    const condition2 = Cond.lessThan('bar', 50);
    expect(Cond.or([condition1, condition2]).toSQL()).toEqual(
      '(`foo` = 123 OR `bar` < 50)'
    );
  });

  // NULL
  it('should format null', () => {
    expect(Cond.null('foo').toSQL()).toEqual('`foo` IS NULL');
  });

  // NOT NULL
  it('should format not null', () => {
    expect(Cond.notNull('foo').toSQL()).toEqual('`foo` IS NOT NULL');
  });

  // LIKE
  it('should format like', () => {
    expect(Cond.like('foo', 'He_lo wor%').toSQL()).toEqual(
      "`foo` LIKE 'He_lo wor%'"
    );
  });

  // NOT LIKE
  it('should format like', () => {
    expect(Cond.notLike('foo', 'He_lo wor%').toSQL()).toEqual(
      "`foo` NOT LIKE 'He_lo wor%'"
    );
  });
});

describe('Conditions.fromString', () => {
  it('should handle an empty array condition', () => {
    const condition = Cond.fromString('column', '');
    expect(condition!.toSQL()).toEqual('`column` = ""');
  });

  it('should handle a single condition string', () => {
    const condition = Cond.fromString('column', '>=10');
    expect(condition!.toSQL()).toEqual('`column` >= "10"');
  });

  it('should handle different operators', () => {
    expect(Cond.fromString('column', '>10')!.toSQL()).toEqual(
      '`column` > "10"'
    );
    expect(Cond.fromString('column', '<=20')!.toSQL()).toEqual(
      '`column` <= "20"'
    );
    expect(Cond.fromString('column', '~value')!.toSQL()).toMatch(/LIKE/);
  });

  it('should default to equal condition', () => {
    const condition = Cond.fromString('column', 'value');
    expect(condition!.toSQL()).toEqual('`column` = "value"');
  });
});
