import { Cond, Condition, ConditionValue, Conditions } from './Condition';
import { SelectQuery } from './Query';

export type ResourceData<T = any> = {
  results?: T[];
  count?: number;
  stats: { [key: string]: string | number };
};

export type ResourceStateOrderItem = {
  direction?: 'ASC' | 'DESC';
  field: string;
};

export interface ResourceState {
  filter?: { [key: string]: unknown };
  order?: ResourceStateOrderItem[];
  searchValue?: string;
  limit?: number;
  offset?: number;
}

/**
 * Updates resource state filter with new values
 * @param resourceState
 * @param values
 * @returns
 */
export const updateResourceStateFilters = (
  resourceState: ResourceState | undefined,
  values: { [key: string]: string[] | string }
): ResourceState => {
  const filter = { ...resourceState?.filter };
  for (const key in values) {
    const value = values[key];
    if (value.length > 0) {
      filter[key] = {
        type: 'auto',
        value: Array.isArray(value) ? value : [value],
      };
    } else {
      delete filter[key];
    }
  }
  const result = { ...resourceState, filter };
  return result;
};

/**
 * Updates resource state filter with new values
 * @param resourceState
 * @param values
 * @returns
 */
export const getResourceStateFiltersValues = (
  resourceState: ResourceState | undefined
): { [key: string]: string[] } => {
  const result: { [key: string]: string[] } = {};
  for (const key in resourceState?.filter) {
    const filter = resourceState.filter[key] as {
      type: string;
      value: unknown;
    };
    if (filter && filter.value && filter.type) {
      const value = filter.value as any[];
      result[key] = value;
    }
  }
  return result;
};

/**
 * Extends query with resource state
 * does not handle limit and offset
 * @param query
 * @param state
 * @param searchFields
 * @param condition
 */
export const extendedQueryByResourceState = (
  query: SelectQuery,
  state?: ResourceState,
  searchFields?: string[],
  condition: 'where' | 'having' = 'having',
  ignoreFields?: string[]
): SelectQuery => {
  const addCondition = (q: SelectQuery, cond: Condition) => {
    return condition === 'having' ? q.having(cond) : q.where(cond);
  };
  let newQuery = query.clone();
  if (state?.filter) {
    for (const key in state.filter) {
      const filter = state.filter[key] as { type: string; value: unknown };

      if (ignoreFields && ignoreFields.includes(key)) {
        continue;
      }

      if (filter && filter.value && filter.type) {
        const value = filter.value as any[];

        switch (filter.type) {
          case 'enum':
          case 'string':
          case 'auto':
            const ors: Condition[] = [];
            for (const _v of value) {
              const v = _v as string;
              const cond = Cond.fromString(key, v);
              if (cond) {
                ors.push(cond);
              }
            }
            newQuery = addCondition(newQuery, Conditions.or(ors));
            break;
          case 'number':
          case 'date':
            newQuery = addCondition(
              newQuery,
              Conditions.between(key, value as [ConditionValue, ConditionValue])
            );
            break;
          default:
            throw new Error(`Unknown filter type: ${filter.type}`);
            break;
        }
      }
    }
  }

  if (state?.order) {
    newQuery = newQuery.removeOrderBy();
    for (const order of state.order) {
      newQuery = newQuery.orderBy(
        order.field,
        order.direction === 'DESC' ? 'DESC' : 'ASC'
      );
    }
  }

  if (searchFields && state?.searchValue) {
    const ors: Condition[] = [];
    for (const field of searchFields) {
      for (const str of state.searchValue.split(' ')) {
        ors.push(Conditions.like(field, `${str}%`));
        ors.push(Conditions.like(field, `% ${str}%`));
      }
    }
    newQuery = addCondition(newQuery, Conditions.or(ors));
  }

  return newQuery;
};

export interface Resource<T = any> {
  data?: ResourceData<T>;
  previousData?: ResourceData<T>;
  selectQuery: SelectQuery;
  statsQuery?: SelectQuery;
  searchFields?: string[];
  loading: boolean;
  error?: Error;
}
