---
created: 2026-01-29T23:27
title: Add subquery support to IN/NOT IN conditions
area: core
files:
  - src/Condition.ts:164-228
  - src/Query.ts:438,446
  - src/Condition.test.ts
  - src/Condition-serialization.test.ts
---

## Problem

ts-query currently doesn't support subquery-based conditions like:
```sql
column IN (SELECT id FROM other_table WHERE ...)
column NOT IN (SELECT id FROM other_table WHERE ...)
```

This is needed for complex filtering scenarios like:
- Find records where a foreign key is in a set of IDs from another query
- Exclude records based on existence in another table

## Solution

Extend `InCondition` and `NotInCondition` to detect `SelectQuery` at runtime:

### API Design
```typescript
// Values (existing)
Cond.in('id', [1, 2, 3])

// Subquery (new) - pass SelectQuery directly
Cond.in('id', Q.select().addField('entity_id').from('other_table'))
```

### Implementation Approach

1. **Update type signatures** - Factory functions accept `ConditionValue[] | SelectQuery | null`

2. **Modify InCondition/NotInCondition classes**:
   - Rename `values` to `source: ExpressionBase[] | SelectQuery`
   - Runtime detection via `instanceof SelectQuery`
   - Pass `options` to subquery's `toSQL()` for `transformTable` support

3. **Update serialization**:
   - `toJSON()`: Output `values` OR `subquery` based on type
   - `fromJSON()`: Detect `subquery` field and reconstruct accordingly

4. **Options passthrough** (Query.ts):
   - WHERE clause (line ~438): Pass `options` to condition `toSQL()`
   - HAVING clause (line ~446): Same pattern

5. **Add SelectQuery import** to Condition.ts

### Files to Modify
- `src/Condition.ts` - Core logic changes
- `src/Query.ts` - Options passthrough
- `src/Condition.test.ts` - Add subquery tests
- `src/Condition-serialization.test.ts` - Add serialization tests

### Test Cases
- Basic subquery IN/NOT IN
- Nested subqueries
- transformTable option on nested queries
- Serialization round-trip
