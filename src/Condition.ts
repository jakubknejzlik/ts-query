import dayjs, { Dayjs, isDayjs } from 'dayjs';

export interface Condition {
  toSQL(): string;
  toJSON(): any;
}

export namespace Condition {
  export function fromJSON(json: any): Condition {
    switch (json.type) {
      case 'BinaryCondition':
        return BinaryCondition.fromJSON(json);
      case 'LogicalCondition':
        return LogicalCondition.fromJSON(json);
      case 'BetweenCondition':
        return BetweenCondition.fromJSON(json);
      case 'InCondition':
        return InCondition.fromJSON(json);
      case 'NotInCondition':
        return NotInCondition.fromJSON(json);
      case 'NullCondition':
        return NullCondition.fromJSON(json);
      case 'LikeCondition':
        return LikeCondition.fromJSON(json);
      case 'ColumnComparisonCondition':
        return ColumnComparisonCondition.fromJSON(json);
      default:
        throw new Error(`Unknown condition type: ${json.type}`);
    }
  }
}

type ConditionKey = string;
export type ConditionValue = string | number | boolean | null | Dayjs;
type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=';

const escapeKey = (key: ConditionKey): string => {
  return escapeColumn(key);
};
const escapeValue = (value: ConditionValue): string => {
  if (isDayjs(value)) {
    return `"${value.format('YYYY-MM-DD HH:mm:ss')}"`;
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  return `${value}`;
};
export const escapeColumn = (name: string): string => {
  const columnMatch = name.match(/^[\.a-zA-Z0-9_]+$/);
  if (columnMatch) {
    return `\`${name.replace(/`/g, '``').split('.').join('`.`')}\``;
  }
  return name;
};

const serializeValue = (value: ConditionValue): string => {
  if (isDayjs(value)) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return `${value}`;
};

const deserializeValue = (value: string): ConditionValue => {
  if (value === 'null') {
    return null;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  const numberValue = Number(value);
  if (!isNaN(numberValue)) {
    return numberValue;
  }
  const dateValue = dayjs(value, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true);
  if (dateValue.isValid()) {
    return dateValue;
  }
  return value;
};

class BinaryCondition implements Condition {
  key: ConditionKey;
  value: ConditionValue;
  operator: Operator;

  constructor(key: ConditionKey, value: ConditionValue, operator: Operator) {
    this.key = key;
    this.value = value;
    this.operator = operator;
  }

  toSQL(): string {
    return `${escapeKey(this.key)} ${this.operator} ${escapeValue(this.value)}`;
  }

  // serialization
  toJSON(): any {
    return {
      type: 'BinaryCondition',
      key: this.key,
      value: serializeValue(this.value),
      operator: this.operator,
    };
  }

  static fromJSON(json: any): BinaryCondition {
    return new BinaryCondition(
      json.key,
      deserializeValue(json.value),
      json.operator
    );
  }
}

class LogicalCondition implements Condition {
  conditions: Condition[];
  operator: 'AND' | 'OR';

  constructor(conditions: Condition[], operator: 'AND' | 'OR') {
    this.conditions = conditions;
    this.operator = operator;
  }

  toSQL(): string {
    return `(${this.conditions
      .map((c) => c.toSQL())
      .join(` ${this.operator} `)})`;
  }

  // serialization
  toJSON(): any {
    return {
      type: 'LogicalCondition',
      conditions: this.conditions.map((condition) => condition.toJSON()),
      operator: this.operator,
    };
  }

  static fromJSON(json: any): LogicalCondition {
    const conditions = json.conditions.map(Condition.fromJSON);
    return new LogicalCondition(conditions, json.operator);
  }
}

class BetweenCondition implements Condition {
  key: ConditionKey;
  from: ConditionValue;
  to: ConditionValue;

  constructor(key: ConditionKey, from: ConditionValue, to: ConditionValue) {
    this.key = key;
    this.from = from;
    this.to = to;
  }

  toSQL(): string {
    return `${escapeKey(this.key)} BETWEEN ${escapeValue(
      this.from
    )} AND ${escapeValue(this.to)}`;
  }

  // serialization
  toJSON(): any {
    return {
      type: 'BetweenCondition',
      key: this.key,
      from: serializeValue(this.from),
      to: serializeValue(this.to),
    };
  }

  static fromJSON(json: any): BetweenCondition {
    return new BetweenCondition(
      json.key,
      deserializeValue(json.from),
      deserializeValue(json.to)
    );
  }
}

class InCondition implements Condition {
  key: ConditionKey;
  values: ConditionValue[];

  constructor(key: ConditionKey, values: ConditionValue[]) {
    this.key = key;
    this.values = values;
  }

  toSQL(): string {
    return `${escapeKey(this.key)} IN (${this.values
      .map(escapeValue)
      .join(', ')})`;
  }

  // serialization
  toJSON(): any {
    return {
      type: 'InCondition',
      key: this.key,
      values: this.values.map(serializeValue),
    };
  }

  static fromJSON(json: any): InCondition {
    return new InCondition(json.key, json.values.map(deserializeValue));
  }
}

class NotInCondition implements Condition {
  key: ConditionKey;
  values: ConditionValue[];

  constructor(key: ConditionKey, values: ConditionValue[]) {
    this.key = key;
    this.values = values;
  }

  toSQL(): string {
    return `${escapeKey(this.key)} NOT IN (${this.values
      .map(escapeValue)
      .join(', ')})`;
  }

  // serialization
  toJSON(): any {
    return {
      type: 'NotInCondition',
      key: this.key,
      values: this.values.map(serializeValue),
    };
  }

  static fromJSON(json: any): NotInCondition {
    return new NotInCondition(json.key, json.values.map(deserializeValue));
  }
}

class NullCondition implements Condition {
  key: ConditionKey;
  isNull: boolean;

  constructor(key: ConditionKey, isNull: boolean) {
    this.key = key;
    this.isNull = isNull;
  }

  toSQL(): string {
    return `${escapeKey(this.key)} IS ${this.isNull ? '' : 'NOT '}NULL`;
  }

  // serialization
  toJSON(): any {
    return {
      type: 'NullCondition',
      key: this.key,
      isNull: this.isNull,
    };
  }

  static fromJSON(json: any): NullCondition {
    return new NullCondition(json.key, json.isNull);
  }
}

class LikeCondition implements Condition {
  key: ConditionKey;
  pattern: string;
  isLike: boolean;

  constructor(key: ConditionKey, pattern: string, isLike: boolean) {
    this.key = key;
    this.pattern = pattern;
    this.isLike = isLike;
  }

  toSQL(): string {
    return `${escapeKey(this.key)} ${this.isLike ? '' : 'NOT '}LIKE \'${
      this.pattern
    }\'`;
  }

  // serialization
  toJSON(): any {
    return {
      type: 'LikeCondition',
      key: this.key,
      pattern: this.pattern,
      isLike: this.isLike,
    };
  }

  static fromJSON(json: any): LikeCondition {
    return new LikeCondition(json.key, json.pattern, json.isLike);
  }
}

class ColumnComparisonCondition implements Condition {
  leftKey: ConditionKey;
  rightKey: ConditionKey;
  operator: Operator;

  constructor(
    leftKey: ConditionKey,
    rightKey: ConditionKey,
    operator: Operator
  ) {
    this.leftKey = leftKey;
    this.rightKey = rightKey;
    this.operator = operator;
  }

  toSQL(): string {
    return `${escapeKey(this.leftKey)} ${this.operator} ${escapeKey(
      this.rightKey
    )}`;
  }

  // serialization
  toJSON(): any {
    return {
      type: 'ColumnComparisonCondition',
      leftKey: this.leftKey,
      rightKey: this.rightKey,
      operator: this.operator,
    };
  }

  static fromJSON(json: any): ColumnComparisonCondition {
    return new ColumnComparisonCondition(
      json.leftKey,
      json.rightKey,
      json.operator
    );
  }
}

export const Conditions = {
  fromString: (column: string, value: string | number): Condition => {
    const str = `${value}`;
    if (str.indexOf('>=') === 0) {
      return Conditions.greaterThanOrEqual(column, str.substring(2));
    }
    if (str.indexOf('<=') === 0) {
      return Conditions.lessThanOrEqual(column, str.substring(2));
    }
    if (str.indexOf('>') === 0) {
      return Conditions.greaterThan(column, str.substring(1));
    }
    if (str.indexOf('<') === 0) {
      return Conditions.lessThan(column, str.substring(1));
    }
    if (str.indexOf('~') === 0) {
      return Conditions.or([
        Conditions.like(column, `${str.substring(1)}%`),
        Conditions.like(column, `% ${str.substring(1)}%`),
      ]);
    }
    if (str.indexOf('!~') === 0) {
      return Conditions.and([
        Conditions.notLike(column, `${str.substring(2)}%`),
        Conditions.notLike(column, `% ${str.substring(2)}%`),
      ]);
    }
    if (str.indexOf('!') === 0) {
      return Conditions.notEqual(column, `${str.substring(1)}%`);
    }
    return Conditions.equal(column, str);
  },
  equal: (key: string, value: ConditionValue) =>
    new BinaryCondition(key, value, '='),
  notEqual: (key: string, value: ConditionValue) =>
    new BinaryCondition(key, value, '!='),
  greaterThan: (key: string, value: ConditionValue) =>
    new BinaryCondition(key, value, '>'),
  lessThan: (key: string, value: ConditionValue) =>
    new BinaryCondition(key, value, '<'),
  greaterThanOrEqual: (key: string, value: ConditionValue) =>
    new BinaryCondition(key, value, '>='),
  lessThanOrEqual: (key: string, value: ConditionValue) =>
    new BinaryCondition(key, value, '<='),
  between: (key: string, values: [ConditionValue, ConditionValue]) =>
    new BetweenCondition(key, values[0], values[1]),
  in: (key: string, values: ConditionValue[]) => new InCondition(key, values),
  notIn: (key: string, values: ConditionValue[]) =>
    new NotInCondition(key, values),
  and: (conditions: Condition[]) => new LogicalCondition(conditions, 'AND'),
  or: (conditions: Condition[]) => new LogicalCondition(conditions, 'OR'),
  null: (key: string) => new NullCondition(key, true),
  notNull: (key: string) => new NullCondition(key, false),
  like: (key: string, pattern: string) => new LikeCondition(key, pattern, true),
  notLike: (key: string, pattern: string) =>
    new LikeCondition(key, pattern, false),
  columnEqual: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, '='),
  columnNotEqual: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, '!='),
  columnGreaterThan: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, '>'),
  columnLessThan: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, '<'),
  columnGreaterThanOrEqual: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, '>='),
  columnLessThanOrEqual: (leftKey: string, rightKey: string) =>
    new ColumnComparisonCondition(leftKey, rightKey, '<='),
};
export { Conditions as Cond };
