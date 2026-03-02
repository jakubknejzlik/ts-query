# Query Targets

This directory contains implementations of `IQueryTarget` for compiling ts-query queries to different backend formats.

## Available Targets

### SQLTarget

Wraps existing SQL flavors (MySQL, SQLite, AWS Timestream) for backward compatibility.

```typescript
import { Q, Cond, SQLTarget } from 'ts-query';

const target = new SQLTarget(Q.flavors.mysql);
const query = Q.select().from('users').where(Cond.equal('id', 1));

console.log(query.compile(target));
// → "SELECT * FROM `users` WHERE `id` = 1"
```

### DynamoDBPartiQLTarget

Compiles queries to PartiQL statements for DynamoDB's `ExecuteStatement` API.

```typescript
import { Q, Cond, DynamoDBPartiQLTarget } from 'ts-query';

const target = new DynamoDBPartiQLTarget();
const query = Q.select()
  .from('Users')
  .where(Cond.equal('pk', 'USER#123'))
  .where(Cond.like('sk', 'ORDER#%'));

console.log(query.compile(target));
// → "SELECT * FROM Users WHERE pk = 'USER#123' AND begins_with(sk, 'ORDER#')"
```

### DynamoDBNativeTarget

Compiles queries to DynamoDB API input objects for Query, Scan, PutItem, UpdateItem, DeleteItem.

```typescript
import { Q, Cond, DynamoDBNativeTarget } from 'ts-query';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const target = new DynamoDBNativeTarget({
  partitionKey: 'pk',
  sortKey: 'sk',
  indexName: 'GSI1',
});

const query = Q.select()
  .from('Users')
  .addField('name')
  .addField('email')
  .where(Cond.equal('pk', 'USER#123'))
  .limit(10);

const input = query.compile(target);
// → DynamoDBQueryInput with KeyConditionExpression, ProjectionExpression, etc.

const client = new DynamoDBClient({});
const result = await client.send(new QueryCommand(input));
```

---

## Creating Custom Targets

You can create custom targets by implementing the `IQueryTarget<TOutput>` interface.

### Interface

```typescript
interface IQueryTarget<TOutput> {
  compileSelect(query: SelectQuery): TOutput;
  compileInsert(mutation: InsertMutation): TOutput;
  compileUpdate(mutation: UpdateMutation): TOutput;
  compileDelete(mutation: DeleteMutation): TOutput;
}
```

### Accessing Query AST

Query objects expose their internal state through getter methods:

```typescript
// SelectQuery
query.getFields()       // SelectField[] - columns to select
query.getWhere()        // Condition[] - WHERE conditions
query.getHaving()       // Condition[] - HAVING conditions
query.getJoins()        // Join[] - JOIN clauses
query.getOrderBy()      // OrderClause[] - ORDER BY clauses
query.getGroupBy()      // ExpressionBase[] - GROUP BY columns
query.getLimit()        // number | undefined
query.getOffset()       // number | undefined
query.getUnionQueries() // { query: SelectQuery, type: UnionType }[]
query.table             // Table - FROM table
query.tables            // Table[] - all tables

// Join
join.getType()          // JoinType - INNER, LEFT, RIGHT, etc.
join.getTable()         // Table
join.getCondition()     // Condition | undefined

// Mutations
mutation.getTable()     // Table
mutation.getWhere()     // Condition[] (Delete, Update)
mutation.getValues()    // RowRecord[] (Insert)
mutation.getSetValues() // RowRecord (Update)
```

### Condition Types

Use `instanceof` to handle different condition types:

```typescript
import {
  BinaryCondition,      // col = val, col > val, etc.
  LogicalCondition,     // AND, OR
  BetweenCondition,     // BETWEEN
  InCondition,          // IN (...)
  NotInCondition,       // NOT IN (...)
  NullCondition,        // IS NULL, IS NOT NULL
  LikeCondition,        // LIKE
  ColumnComparisonCondition, // col1 = col2
  NotCondition,         // NOT (...)
} from 'ts-query';

function compileCondition(condition: Condition): string {
  if (condition instanceof BinaryCondition) {
    return `${condition.key} ${condition.operator} ${condition.value}`;
  }
  if (condition instanceof LogicalCondition) {
    return condition.conditions
      .map(c => compileCondition(c))
      .join(` ${condition.operator} `);
  }
  // ... handle other types
}
```

---

## Example: REST API Target

Here's an example of implementing a REST API target:

```typescript
import {
  IQueryTarget,
  SelectQuery,
  InsertMutation,
  UpdateMutation,
  DeleteMutation,
  Condition,
  BinaryCondition,
  LogicalCondition,
} from 'ts-query';

interface HTTPRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  params?: Record<string, string>;
  body?: any;
  headers?: Record<string, string>;
}

interface RESTTargetOptions {
  baseUrl: string;
  /** Map table names to API endpoints */
  endpoints?: Record<string, string>;
}

export class RESTTarget implements IQueryTarget<HTTPRequest> {
  constructor(private options: RESTTargetOptions) {}

  compileSelect(query: SelectQuery): HTTPRequest {
    const table = query.table?.getTableName() ?? '';
    const endpoint = this.options.endpoints?.[table] ?? table;

    const params: Record<string, string> = {};

    // Handle field selection
    const fields = query.getFields();
    if (fields.length > 0) {
      params.fields = fields
        .map(f => this.extractColumnName(f.name))
        .join(',');
    }

    // Handle WHERE conditions as query params
    const where = query.getWhere();
    if (where.length > 0) {
      params.filter = this.serializeConditions(where);
    }

    // Handle pagination
    const limit = query.getLimit();
    const offset = query.getOffset();
    if (limit !== undefined) params.limit = String(limit);
    if (offset !== undefined) params.offset = String(offset);

    // Handle sorting
    const orderBy = query.getOrderBy();
    if (orderBy.length > 0) {
      params.sort = orderBy
        .map(o => `${this.extractColumnName(o.field)}:${o.direction.toLowerCase()}`)
        .join(',');
    }

    return {
      method: 'GET',
      url: `${this.options.baseUrl}/${endpoint}`,
      params,
    };
  }

  compileInsert(mutation: InsertMutation): HTTPRequest {
    const table = mutation.getTable().getTableName() ?? '';
    const endpoint = this.options.endpoints?.[table] ?? table;
    const values = mutation.getValues();

    if (!values || values.length === 0) {
      throw new Error('INSERT requires values');
    }

    return {
      method: 'POST',
      url: `${this.options.baseUrl}/${endpoint}`,
      body: values.length === 1
        ? this.extractRowValues(values[0])
        : values.map(v => this.extractRowValues(v)),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  compileUpdate(mutation: UpdateMutation): HTTPRequest {
    const table = mutation.getTable().getTableName() ?? '';
    const endpoint = this.options.endpoints?.[table] ?? table;
    const setValues = mutation.getSetValues();
    const where = mutation.getWhere();

    // Extract ID from WHERE clause for RESTful URL
    const id = this.extractIdFromConditions(where);

    return {
      method: 'PATCH',
      url: id
        ? `${this.options.baseUrl}/${endpoint}/${id}`
        : `${this.options.baseUrl}/${endpoint}`,
      body: this.extractRowValues(setValues),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  compileDelete(mutation: DeleteMutation): HTTPRequest {
    const table = mutation.getTable().getTableName() ?? '';
    const endpoint = this.options.endpoints?.[table] ?? table;
    const where = mutation.getWhere();

    // Extract ID from WHERE clause for RESTful URL
    const id = this.extractIdFromConditions(where);

    if (!id) {
      throw new Error('DELETE requires an id in WHERE clause');
    }

    return {
      method: 'DELETE',
      url: `${this.options.baseUrl}/${endpoint}/${id}`,
    };
  }

  private serializeConditions(conditions: Condition[]): string {
    return conditions
      .map(c => this.serializeCondition(c))
      .join(' AND ');
  }

  private serializeCondition(condition: Condition): string {
    if (condition instanceof BinaryCondition) {
      const key = this.extractColumnName(condition.key);
      const value = this.extractValue(condition.value);
      return `${key}${condition.operator}${value}`;
    }
    if (condition instanceof LogicalCondition) {
      const parts = condition.conditions.map(c => this.serializeCondition(c));
      return `(${parts.join(` ${condition.operator} `)})`;
    }
    // Handle other condition types...
    return '';
  }

  private extractIdFromConditions(conditions: Condition[]): string | undefined {
    for (const condition of conditions) {
      if (condition instanceof BinaryCondition && condition.operator === '=') {
        const key = this.extractColumnName(condition.key);
        if (key === 'id' || key === '_id') {
          return String(this.extractValue(condition.value));
        }
      }
    }
    return undefined;
  }

  private extractColumnName(expr: any): string {
    if (typeof expr === 'string') return expr;
    if (expr?.serialize) {
      const serialized = expr.serialize();
      if (!serialized.startsWith('!')) return serialized;
    }
    return String(expr);
  }

  private extractValue(expr: any): any {
    if (expr?.serialize) {
      const serialized = expr.serialize();
      if (serialized.startsWith('!!!')) {
        return JSON.parse(serialized.substring(3));
      }
    }
    return expr;
  }

  private extractRowValues(row: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      result[key] = this.extractValue(value);
    }
    return result;
  }
}
```

### Usage

```typescript
const target = new RESTTarget({
  baseUrl: 'https://api.example.com',
  endpoints: {
    users: 'v1/users',
    orders: 'v1/orders',
  },
});

// GET request
const query = Q.select()
  .from('users')
  .addField('id')
  .addField('name')
  .where(Cond.equal('status', 'active'))
  .limit(10);

const request = query.compile(target);
// {
//   method: 'GET',
//   url: 'https://api.example.com/v1/users',
//   params: {
//     fields: 'id,name',
//     filter: 'status=active',
//     limit: '10'
//   }
// }

// POST request
const insert = Q.insert('users').values([{ name: 'John', email: 'john@example.com' }]);
const postRequest = insert.compile(target);
// {
//   method: 'POST',
//   url: 'https://api.example.com/v1/users',
//   body: { name: 'John', email: 'john@example.com' },
//   headers: { 'Content-Type': 'application/json' }
// }

// PATCH request
const update = Q.update('users')
  .set({ name: 'John Doe' })
  .where(Cond.equal('id', 123));
const patchRequest = update.compile(target);
// {
//   method: 'PATCH',
//   url: 'https://api.example.com/v1/users/123',
//   body: { name: 'John Doe' },
//   headers: { 'Content-Type': 'application/json' }
// }

// DELETE request
const del = Q.delete('users').where(Cond.equal('id', 123));
const deleteRequest = del.compile(target);
// {
//   method: 'DELETE',
//   url: 'https://api.example.com/v1/users/123'
// }
```

---

## Handling Unsupported Features

Targets should validate queries and throw clear errors for unsupported features:

```typescript
private validateSelect(query: SelectQuery): void {
  if (query.getJoins().length > 0) {
    throw new Error('This target does not support JOIN operations');
  }
  if (query.getGroupBy().length > 0) {
    throw new Error('This target does not support GROUP BY');
  }
  // ... etc
}
```

## Capability Detection

Consider adding a static `capabilities` property to help users understand what's supported:

```typescript
class MyTarget implements IQueryTarget<MyOutput> {
  static readonly capabilities = {
    supportsJoins: false,
    supportsOffset: true,
    supportsGroupBy: false,
    supportsTransactions: true,
    supportedOperators: ['=', '!=', '>', '<', '>=', '<='],
  };

  // ... implementation
}
```
