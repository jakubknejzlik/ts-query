import { Q, summarize, walk, GuardQuery, ISQLFlavor } from "./index";
import { validateSerializedQuery } from "./deserialize";
import { inlineBindings } from "./test-bindings";

const typed = (value: string) => "!!!" + JSON.stringify(value);
const fn = (name: string, ...args: string[]) =>
  `FN(${JSON.stringify([name, ...args])})`;
const op = (...args: string[]) => `OP(${JSON.stringify(["+", ...args])})`;
const table = (source = "users") => ({ type: "Table", source });
const select = (name = "id") => ({
  type: "SelectQuery",
  tables: [table()],
  fields: [{ name }],
});
const binary = (key: string, value: string) => ({
  type: "BinaryCondition",
  key,
  value,
  operator: "=",
});

// Every payload below is STRING DATA. Its outer !!! wrapper is the only
// encoding to decode; the bytes inside must never become another AST node.
const encodings = [
  {
    name: "typed hidden EXISTS",
    value: JSON.stringify({
      type: "ExistsCondition",
      subquery: {
        ...select(),
        tables: [table("secrets")],
      },
    }),
    condition: true,
  },
  {
    name: "typed raw condition",
    value: JSON.stringify(
      binary('!!"(SELECT secret FROM secrets LIMIT 1)"!!', "!!!1")
    ),
    condition: true,
  },
  {
    name: "typed denied function condition",
    value: JSON.stringify(binary(fn("RANDOM"), "!!!1")),
    condition: true,
  },
  { name: "raw-looking string", value: '!!"SELECT secret FROM secrets"!!' },
  { name: "date-looking string", value: "!D!1704164645000!!" },
  { name: "function-looking string", value: fn("RANDOM") },
  { name: "operation-looking string", value: op("!!!40", "!!!2") },
  {
    name: "plain JSON object string",
    value: JSON.stringify({ answer: 42, text: 'O\'Reilly says "? $1"' }),
  },
  { name: "typed-literal-looking string", value: typed("still data") },
];

type Render = (
  value: string,
  column: (name: string) => string,
  source: (name: string) => string
) => string;
interface Position {
  name: string;
  input: (wire: string) => unknown;
  render: Render;
  columns: string[];
  functions?: string[];
  depth?: number;
  tables?: [string, number][];
  subqueries?: number[];
  union?: boolean;
  kind?: string;
  // These slots call Expression.deserialize on an existing ValueExpression.
  reparses?: boolean;
  // INSERT rows and LIKE patterns are undecoded wire data.
  wireData?: boolean;
  mutation?: boolean;
}
interface Predicate {
  name: string;
  input: (wire: string) => object;
  render: (value: string, id: string) => string;
  columns: string[];
  reparses?: boolean;
  wireData?: boolean;
}

const predicates: Predicate[] = [
  ...["=", "!=", ">", "<", ">=", "<="].flatMap((operator) => [
    {
      name: `Binary ${operator} key`,
      input: (v: string) => ({ ...binary(v, typed("fixed")), operator }),
      render: (v: string) => `${v} ${operator} 'FIXED'`,
      columns: [],
      reparses: true,
    },
    {
      name: `Binary ${operator} value`,
      input: (v: string) => ({ ...binary("id", v), operator }),
      render: (v: string, id: string) => `${id} ${operator} ${v}`,
      columns: ["id"],
    },
  ]),
  ...["leftKey", "rightKey"].map((key) => ({
    name: `ColumnComparison ${key}`,
    input: (v: string) => ({
      type: "ColumnComparisonCondition",
      leftKey: "id",
      rightKey: "id",
      [key]: v,
      operator: "=",
    }),
    render: (v: string, id: string) =>
      key === "leftKey" ? `${v} = ${id}` : `${id} = ${v}`,
    columns: ["id"],
    reparses: true,
  })),
  ...["key", "from", "to"].map((key) => ({
    name: `Between ${key}`,
    input: (v: string) => ({
      type: "BetweenCondition",
      key: "id",
      from: typed("fixed"),
      to: typed("fixed"),
      [key]: v,
    }),
    render: (v: string, id: string) =>
      `${key === "key" ? v : id} BETWEEN ${
        key === "from" ? v : "'FIXED'"
      } AND ${key === "to" ? v : "'FIXED'"}`,
    columns: key === "key" ? [] : ["id"],
    reparses: true,
  })),
  ...["In", "NotIn"].flatMap((type) =>
    ["key", "values"].map((slot) => ({
      name: `${type} ${slot}`,
      input: (v: string) => ({
        type: `${type}Condition`,
        key: slot === "key" ? v : "id",
        values: slot === "values" ? [v, v] : [typed("fixed")],
      }),
      render: (v: string, id: string) =>
        `${slot === "key" ? v : id} ${type === "NotIn" ? "NOT " : ""}IN (${
          slot === "values" ? `${v}, ${v}` : "'FIXED'"
        })`,
      columns: slot === "key" ? [] : ["id"],
      reparses: slot === "key",
    }))
  ),
  ...[true, false].map((isNull) => ({
    name: `Null ${isNull ? "IS NULL" : "IS NOT NULL"} key`,
    input: (v: string) => ({ type: "NullCondition", key: v, isNull }),
    render: (v: string) => `${v} IS ${isNull ? "" : "NOT "}NULL`,
    columns: [],
    reparses: true,
  })),
  ...[true, false].flatMap((isLike) =>
    ["key", "pattern"].map((slot) => ({
      name: `Like ${isLike ? "LIKE" : "NOT LIKE"} ${slot}`,
      input: (v: string) => ({
        type: "LikeCondition",
        key: slot === "key" ? v : "id",
        pattern: slot === "pattern" ? v : "fixed",
        isLike,
      }),
      render: (v: string, id: string) =>
        `${slot === "key" ? v : id} ${isLike ? "" : "NOT "}LIKE ${
          slot === "pattern" ? v : "'FIXED'"
        }`,
      columns: slot === "key" ? [] : ["id"],
      reparses: slot === "key",
      wireData: slot === "pattern",
    }))
  ),
  ...["AND", "OR"].flatMap((operator) =>
    ["key", "value"].map((slot) => ({
      name: `Logical ${operator} nested ${slot}`,
      input: (v: string) => ({
        type: "LogicalCondition",
        operator,
        conditions: [
          binary(
            slot === "key" ? v : "id",
            slot === "value" ? v : typed("fixed")
          ),
          binary("id", typed("fixed")),
        ],
      }),
      render: (v: string, id: string) =>
        `(${slot === "key" ? v : id} = ${
          slot === "value" ? v : "'FIXED'"
        } ${operator} ${id} = 'FIXED')`,
      columns: slot === "key" ? ["id"] : ["id", "id"],
      reparses: slot === "key",
    }))
  ),
  ...["key", "value"].map((slot) => ({
    name: `Not nested ${slot}`,
    input: (v: string) => ({
      type: "NotCondition",
      condition: binary(
        slot === "key" ? v : "id",
        slot === "value" ? v : typed("fixed")
      ),
    }),
    render: (v: string, id: string) =>
      `NOT (${slot === "key" ? v : id} = ${slot === "value" ? v : "'FIXED'"})`,
    columns: slot === "key" ? [] : ["id"],
    reparses: slot === "key",
  })),
];

const positions: Position[] = [
  {
    name: "SELECT field and safe alias",
    input: (v) => ({ ...select(v), fields: [{ name: v, alias: "ok" }] }),
    render: (v, c, t) => `SELECT ${v} AS ${c("ok")} FROM ${t("users")}`,
    columns: [],
    reparses: true,
  },
  ...[
    {
      name: "function argument",
      wire: (v: string) => fn("COUNT", v),
      sql: (v: string) => `COUNT(${v})`,
      functions: ["COUNT"],
    },
    {
      name: "operation argument",
      wire: (v: string) => op(v, v),
      sql: (v: string) => `(${v} + ${v})`,
      functions: [],
    },
    {
      name: "nested function/operation argument",
      wire: (v: string) => fn("COUNT", op(fn("MAX", v), v)),
      sql: (v: string) => `COUNT((MAX(${v}) + ${v}))`,
      functions: ["COUNT", "MAX"],
    },
  ].map(({ name, wire, sql, functions }) => ({
    name,
    input: (v: string) => select(wire(v)),
    render: (v: string, _c, t) => `SELECT ${sql(v)} FROM ${t("users")}`,
    columns: [],
    functions,
    reparses: true,
  })),
  ...["where", "having"].flatMap((clause) =>
    predicates.map((predicate) => ({
      name: `${clause.toUpperCase()} ${predicate.name}`,
      input: (v: string) => ({ ...select(), [clause]: [predicate.input(v)] }),
      render: (v: string, c, t) =>
        `SELECT ${c("id")} FROM ${t(
          "users"
        )} ${clause.toUpperCase()} ${predicate.render(v, c("id"))}`,
      columns: ["id", ...predicate.columns],
      reparses: predicate.reparses,
      wireData: predicate.wireData,
    }))
  ),
  ...["where", "having"].flatMap((clause) =>
    ["Exists", "NotExists", "In", "NotIn"].flatMap((type) =>
      ["field", "WHERE key", "WHERE value"].map((slot) => ({
        name: `${clause.toUpperCase()} ${type} subquery ${slot}`,
        input: (v: string) => ({
          ...select(),
          [clause]: [
            {
              type: `${type}Condition`,
              ...(["In", "NotIn"].includes(type) ? { key: "id" } : {}),
              subquery:
                slot === "field"
                  ? select(v)
                  : {
                      ...select(),
                      where: [
                        binary(
                          slot === "WHERE key" ? v : "id",
                          slot === "WHERE value" ? v : typed("fixed")
                        ),
                      ],
                    },
            },
          ],
        }),
        render: (v: string, c, t) => {
          const subquery =
            slot === "field"
              ? `SELECT ${v} FROM ${t("users")}`
              : `SELECT ${c("id")} FROM ${t("users")} WHERE ${
                  slot === "WHERE key" ? v : c("id")
                } = ${slot === "WHERE value" ? v : "'FIXED'"}`;
          const condition = type.endsWith("Exists")
            ? `${type === "NotExists" ? "NOT " : ""}EXISTS (${subquery})`
            : `${c("id")} ${type === "NotIn" ? "NOT " : ""}IN (${subquery})`;
          return `SELECT ${c("id")} FROM ${t(
            "users"
          )} ${clause.toUpperCase()} ${condition}`;
        },
        columns: [
          "id",
          ...(["In", "NotIn"].includes(type) ? ["id"] : []),
          ...(slot === "field" ? [] : ["id"]),
          ...(slot === "WHERE value" ? ["id"] : []),
        ],
        depth: 1,
        tables: [
          ["users", 0],
          ["users", 1],
        ] as [string, number][],
        subqueries: [1],
        reparses: slot !== "WHERE value",
      }))
    )
  ),
  ...["key", "value"].map((slot) => ({
    name: `JOIN ON ${slot}`,
    input: (v: string) => ({
      ...select(),
      joins: [
        {
          type: "Join",
          joinType: "INNER",
          table: table("teams"),
          condition: binary(
            slot === "key" ? v : "id",
            slot === "value" ? v : typed("fixed")
          ),
        },
      ],
    }),
    render: (v: string, c, t) =>
      `SELECT ${c("id")} FROM ${t("users")} INNER JOIN ${t("teams")} ON ${
        slot === "key" ? v : c("id")
      } = ${slot === "value" ? v : "'FIXED'"}`,
    columns: slot === "key" ? ["id"] : ["id", "id"],
    tables: [
      ["users", 0],
      ["teams", 0],
    ] as [string, number][],
    reparses: slot === "key",
  })),
  {
    name: "ORDER BY",
    input: (v) => ({ ...select(), orderBy: [{ field: v, direction: "ASC" }] }),
    render: (v, c, t) =>
      `SELECT ${c("id")} FROM ${t("users")} ORDER BY ${v} ASC`,
    columns: ["id"],
  },
  {
    name: "GROUP BY",
    input: (v) => ({ ...select(), groupBy: [v] }),
    render: (v, c, t) => `SELECT ${c("id")} FROM ${t("users")} GROUP BY ${v}`,
    columns: ["id"],
  },
  ...["UNION", "UNION ALL"].map((type) => ({
    name: `${type} operand`,
    input: (v: string) => ({
      ...select(),
      unionQueries: [{ type, query: select(v) }],
    }),
    render: (v: string, c, t) =>
      `(${`SELECT ${c("id")} FROM ${t(
        "users"
      )}`}) ${type} (SELECT ${v} FROM ${t("users")})`,
    columns: ["id"],
    depth: 1,
    subqueries: [1],
    union: true,
    tables: [
      ["users", 0],
      ["users", 1],
    ] as [string, number][],
    reparses: true,
  })),
  {
    name: "FROM subquery field",
    input: (v) => ({
      ...select(),
      tables: [{ type: "Table", source: select(v), alias: "u" }],
    }),
    render: (v, c, t) =>
      `SELECT ${c("id")} FROM (SELECT ${v} FROM ${t("users")}) AS ${c("u")}`,
    columns: ["id"],
    depth: 1,
    subqueries: [1],
    tables: [["users", 1]],
    reparses: true,
  },
  ...[1, 2].map((rows) => ({
    name: `INSERT ${rows === 1 ? "single row" : "multi-row"} values`,
    input: (v: string) => ({
      type: "InsertMutation",
      table: table(),
      values: Array.from({ length: rows }, () => ({ id: v })),
    }),
    render: (v: string, c) =>
      `INSERT INTO ${c("users")} (${c("id")}) VALUES ${Array.from(
        { length: rows },
        () => `(${v})`
      ).join(", ")}`,
    columns: Array.from({ length: rows }, () => "id"),
    kind: "insert",
    wireData: true,
    mutation: true,
  })),
  {
    name: "INSERT SELECT field",
    input: (v) => ({
      type: "InsertMutation",
      table: table(),
      select: [select(v), ["id"]],
    }),
    render: (v, c, t) =>
      `INSERT INTO ${c("users")} (${c("id")}) SELECT ${v} FROM ${t("users")}`,
    columns: ["id"],
    kind: "insert",
    depth: 1,
    subqueries: [1],
    tables: [
      ["users", 0],
      ["users", 1],
    ],
    mutation: true,
    reparses: true,
  },
  {
    name: "UPDATE SET",
    input: (v) => ({
      type: "UpdateMutation",
      table: table(),
      values: { id: v },
      where: [],
    }),
    render: (v, c) => `UPDATE ${c("users")} SET ${c("id")} = ${v}`,
    columns: ["id"],
    kind: "update",
    mutation: true,
  },
  {
    name: "UPDATE SET SELECT field",
    input: (v) => ({
      type: "UpdateMutation",
      table: table(),
      values: { id: JSON.stringify(select(v)) },
      where: [],
    }),
    render: (v, c, t) =>
      `UPDATE ${c("users")} SET ${c("id")} = (SELECT ${v} FROM ${t("users")})`,
    columns: ["id"],
    kind: "update",
    depth: 1,
    subqueries: [1],
    tables: [
      ["users", 0],
      ["users", 1],
    ],
    mutation: true,
    reparses: true,
  },
  ...["Update", "Delete"].flatMap((type) =>
    ["key", "value"].map((slot) => ({
      name: `${type.toUpperCase()} WHERE ${slot}`,
      input: (v: string) => ({
        type: `${type}Mutation`,
        table: table(),
        ...(type === "Update" ? { values: { id: typed("fixed") } } : {}),
        where: [
          binary(
            slot === "key" ? v : "id",
            slot === "value" ? v : typed("fixed")
          ),
        ],
      }),
      render: (v: string, c) =>
        `${
          type === "Update"
            ? `UPDATE ${c("users")} SET ${c("id")} = 'FIXED'`
            : `DELETE FROM ${c("users")}`
        } WHERE ${slot === "key" ? v : c("id")} = ${
          slot === "value" ? v : "'FIXED'"
        }`,
      columns: [
        ...(type === "Update" ? ["id"] : []),
        ...(slot === "value" ? ["id"] : []),
      ],
      kind: type.toLowerCase(),
      mutation: true,
      reparses: slot === "key",
    }))
  ),
  ...["ctas", "cvas"].map((type) => ({
    name: `${type.toUpperCase()} SELECT field`,
    input: (v: string) => ({
      type,
      [type === "ctas" ? "tableName" : "viewName"]: "archive",
      select: select(v),
    }),
    render: (v: string, c, t) =>
      `CREATE ${type === "ctas" ? "TABLE" : "VIEW"} ${c(
        "archive"
      )} AS SELECT ${v} FROM ${t("users")}`,
    columns: [],
    kind: type,
    depth: 1,
    subqueries: [1],
    tables: [
      ["archive", 0],
      ["users", 1],
    ] as [string, number][],
    mutation: true,
    reparses: true,
  })),
];

function assertPolicy(query: GuardQuery, position: Position) {
  const tables = position.tables ?? [["users", 0]];
  const columns = position.columns.map((name) => [undefined, name]);
  const functions = position.functions ?? [];
  const onTable = jest.fn();
  const onColumn = jest.fn();
  const onFunction = jest.fn();
  const onRaw = jest.fn(() => {
    throw new Error("Policy denies raw SQL");
  });
  const onSubquery = jest.fn();
  const onUnion = jest.fn();
  const onMutation = jest.fn();
  walk(query, {
    onTable,
    onColumn,
    onFunction,
    onRaw,
    onSubquery,
    onUnion,
    onMutation,
  });
  expect(onTable.mock.calls).toEqual(
    tables.map(([name, depth]) => [name, undefined, depth])
  );
  expect(onColumn.mock.calls).toEqual(columns);
  expect(onFunction.mock.calls).toEqual(functions.map((name) => [name]));
  expect(onRaw).not.toHaveBeenCalled();
  expect(onSubquery.mock.calls).toEqual(
    (position.subqueries ?? []).map((depth) => [depth])
  );
  expect(onUnion).toHaveBeenCalledTimes(position.union ? 1 : 0);
  expect(onMutation.mock.calls).toEqual(
    ["insert", "update", "delete"].includes(position.kind)
      ? [[position.kind]]
      : []
  );
  expect(summarize(query)).toEqual({
    tables: [...new Set(tables.map(([name]) => name))],
    columns: [...new Set(position.columns)].map((name) => ({
      table: undefined,
      name,
    })),
    functions: [...new Set(functions)],
    hasRaw: false,
    hasUnion: position.union ?? false,
    maxDepth: position.depth ?? 0,
    kind: position.kind ?? "select",
  });
}

function expectedRender(
  position: Position,
  value: string,
  flavor: ISQLFlavor,
  bound: boolean,
  transformed: boolean
) {
  const bindings: unknown[] = [];
  // Deliberately generate expected SQL without invoking any expression parser.
  // A marker also preserves repeated operands and the SQL order of bindings.
  const marker = "\u0001literal\u0001";
  const column = (name: string) => flavor.escapeColumn(name);
  const source = (name: string) =>
    flavor.escapeTable(transformed ? `guard_${name}` : name);
  const template = position.render(marker, column, source);
  const sql = template.replace(/\u0001literal\u0001|'FIXED'/g, (token) => {
    const datum = token === "'FIXED'" ? "fixed" : value;
    bindings.push(datum);
    return bound
      ? flavor.parameterPlaceholder?.(bindings.length) ?? "?"
      : flavor.escapeValue(datum);
  });
  return { sql, bindings };
}

describe.each(["sqlite", "mysql", "postgres", "awsTimestream"] as const)(
  "Serialized literal positions × %s",
  (dialect) => {
    const flavor = Q.flavors[dialect];
    for (const position of positions.filter(
      (position) => dialect !== "awsTimestream" || !position.mutation
    )) {
      for (const encoding of encodings) {
        // Invariant: Expression.ts:46-55 must not reparse data skipped by visitor.ts:77.
        const test = position.reparses && encoding.condition ? it.failing : it;
        test(`${position.name} × ${encoding.name}`, () => {
          const wire = typed(encoding.value);
          const input = position.input(wire);
          const options = {
            allowRaw: false,
            functions: ["COUNT", "MAX"],
            maxDepth: position.depth ?? 0,
          };
          expect(() => validateSerializedQuery(input, options)).not.toThrow();
          const query = Q.deserialize(JSON.stringify(input), options);
          assertPolicy(query, position);
          const before = query.serialize();
          const value = position.wireData ? wire : encoding.value;
          for (const transformed of [false, true]) {
            const transformTable = jest.fn((name: string) => `guard_${name}`);
            const renderOptions = transformed ? { transformTable } : undefined;
            const result = query.toSQLWithBindings(flavor, renderOptions);
            expect(result).toEqual(
              expectedRender(position, value, flavor, true, transformed)
            );
            if (transformed) {
              const sources = (position.tables ?? [["users", 0]])
                .filter(([, depth]) => !position.mutation || Number(depth) > 0)
                .map(([name]) => [name]);
              expect(transformTable.mock.calls).toEqual(sources);
            }
            expect(query.toSQL(flavor, renderOptions)).toBe(
              expectedRender(position, value, flavor, false, transformed).sql
            );
            expect(inlineBindings(result, flavor)).toBe(
              query.toSQL(flavor, renderOptions)
            );
          }
          assertPolicy(query, position);
          expect(query.serialize()).toBe(before);
        });
      }
    }
  }
);
