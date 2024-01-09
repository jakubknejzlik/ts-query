import { Conditions } from './Condition';
import { Query, SelectQuery } from './Query';

describe('Query builder JSON Serialization/Deserialization', () => {
  // Round-trip Serialization and Deserialization
  it('should handle round-trip JSON serialization and deserialization for a basic query', () => {
    const originalQuery = Query.select('table').where(
      Conditions.equal('foo', 123)
    );
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = SelectQuery.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  // Round-trip Serialization and Deserialization for Complex Query
  it('should handle round-trip JSON serialization and deserialization for a complex query', () => {
    const originalQuery = Query.select('table')
      .field('foo')
      .field('bar', 'aliasBar')
      .where(Conditions.equal('foo', 123))
      .orderBy('bar', 'DESC')
      .limit(10)
      .offset(5);
    const jsonStr = originalQuery.serialize();
    const deserializedQuery = SelectQuery.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });

  // Round-trip Serialization and Deserialization for Group By and Having
  it('should handle round-trip JSON serialization and deserialization for group by and having', () => {
    const originalQuery = Query.select('table')
      .groupBy('foo')
      .having(Conditions.greaterThan('bar', 50));
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = SelectQuery.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
  it('should handle round-trip JSON serialization and deserialization for JOINS', () => {
    const originalQuery = Query.select('table')
      .join(
        Query.table('otherTable', 'T2'),
        Conditions.columnEqual('table.foo', 'otherTable.bar')
      )
      .leftJoin(
        Query.table('anotherTable', 'AAA'),
        Conditions.columnEqual('table.foo', 'anotherTable.bar')
      );
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = SelectQuery.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
  it('should handle round-trip JSON serialization and deserialization stats query', () => {
    const originalQuery = Query.stats().field(
      'SUM(price_without_charges)',
      'price_without_charges'
    );
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = SelectQuery.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
  it('should handle round-trip JSON serialization and deserialization of subquery', () => {
    const originalQuery = Query.select(Query.select('table'))
      .join(
        Query.table('otherTable', 'T2'),
        Conditions.columnEqual('table.foo', 'otherTable.bar')
      )
      .leftJoin(
        Query.table('anotherTable', 'AAA'),
        Conditions.columnEqual('table.foo', 'anotherTable.bar')
      );
    const jsonStr = JSON.stringify(originalQuery.toJSON());
    const deserializedQuery = SelectQuery.deserialize(jsonStr);
    expect(deserializedQuery.toSQL()).toEqual(originalQuery.toSQL());
  });
});
