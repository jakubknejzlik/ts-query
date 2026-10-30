import {
  Cond,
  DeserializeError,
  Q,
  summarize,
  walk,
  ISQLFlavor,
} from "./index";
import { validateSerializedQuery } from "./deserialize";
import { inlineBindings } from "./test-bindings";

const typed = (value: string) => "!!!" + JSON.stringify(value);
const table = { type: "Table", source: "users" };
const select = (name = "id") => ({
  type: "SelectQuery",
  tables: [table],
  fields: [{ name }],
});
const binary = (value: string) => ({
  type: "BinaryCondition",
  key: "id",
  value,
  operator: "=",
});
const hidden = JSON.stringify({
  type: "ExistsCondition",
  subquery: { ...select(), tables: [{ type: "Table", source: "secrets" }] },
});
const strings = [
  ["typed hidden query", typed(hidden)],
  ["raw", '!!"SELECT secret FROM secrets"!!'],
  ["date", "!D!1704164645000!!"],
  ["function", 'FN(["RANDOM"])'],
  ["operation", 'OP(["+","!!!40","!!!2"])'],
  ["JSON object", '{"answer":42}'],
] as const;
const guarded = { allowRaw: false, functions: [], maxDepth: 0 };

// Rejections are checked at BOTH entry points and by their public error code.
function rejects(input: unknown, code: string, maxDepth = 0) {
  const options = { ...guarded, maxDepth };
  for (const invoke of [
    () => validateSerializedQuery(input, options),
    () => Q.deserialize(JSON.stringify(input), options),
  ]) {
    expect(invoke).toThrow(DeserializeError);
    expect(invoke).toThrow(expect.objectContaining({ code }));
  }
}

const identifiers: [string, (name: string) => unknown][] = [
  [
    "SELECT alias",
    (alias) => ({ ...select(), fields: [{ name: "id", alias }] }),
  ],
  [
    "table source",
    (source) => ({ ...select(), tables: [{ ...table, source }] }),
  ],
  ["table alias", (alias) => ({ ...select(), tables: [{ ...table, alias }] })],
  [
    "JOIN table source",
    (source) => ({
      ...select(),
      joins: [{ type: "Join", joinType: "CROSS", table: { ...table, source } }],
    }),
  ],
  [
    "JOIN table alias",
    (alias) => ({
      ...select(),
      joins: [{ type: "Join", joinType: "CROSS", table: { ...table, alias } }],
    }),
  ],
  [
    "INSERT column",
    (key) => ({ type: "InsertMutation", table, values: [{ [key]: "data" }] }),
  ],
  [
    "INSERT SELECT column",
    (key) => ({ type: "InsertMutation", table, select: [select(), [key]] }),
  ],
  [
    "UPDATE column",
    (key) => ({
      type: "UpdateMutation",
      table,
      values: { [key]: typed("data") },
      where: [],
    }),
  ],
  [
    "mutation table",
    (source) => ({
      type: "DeleteMutation",
      table: { ...table, source },
      where: [],
    }),
  ],
  [
    "CTAS table",
    (tableName) => ({ type: "ctas", tableName, select: select() }),
  ],
  ["CVAS view", (viewName) => ({ type: "cvas", viewName, select: select() })],
];

const nestedQueries: [string, (query: object) => object][] = [
  [
    "FROM",
    (query) => ({
      ...select(),
      tables: [{ type: "Table", source: query, alias: "u" }],
    }),
  ],
  [
    "JOIN",
    (query) => ({
      ...select(),
      joins: [
        {
          type: "Join",
          joinType: "CROSS",
          table: { type: "Table", source: query, alias: "j" },
        },
      ],
    }),
  ],
  ...["Exists", "NotExists", "In", "NotIn"].map(
    (type): [string, (query: object) => object] => [
      type,
      (query) => ({
        ...select(),
        where: [{ type: `${type}Condition`, key: "id", subquery: query }],
      }),
    ]
  ),
  ...["UNION", "UNION ALL"].map((type): [string, (query: object) => object] => [
    type,
    (query) => ({ ...select(), unionQueries: [{ type, query }] }),
  ]),
  [
    "INSERT SELECT",
    (query) => ({ type: "InsertMutation", table, select: [query, ["id"]] }),
  ],
  [
    "UPDATE SELECT",
    (query) => ({
      type: "UpdateMutation",
      table,
      values: { id: JSON.stringify(query) },
      where: [],
    }),
  ],
  ["CTAS", (query) => ({ type: "ctas", tableName: "archive", select: query })],
  ["CVAS", (query) => ({ type: "cvas", viewName: "archive", select: query })],
];

describe.each(["sqlite", "mysql", "postgres", "awsTimestream"] as const)(
  "Guard boundaries and compatibility × %s",
  (dialect) => {
    const flavor: ISQLFlavor = Q.flavors[dialect];
    const column = (name: string) => flavor.escapeColumn(name);
    const placeholder = (index: number) =>
      flavor.parameterPlaceholder?.(index) ?? "?";
    const textPlaceholder = (index: number) =>
      dialect === "postgres" ? `CAST($${index} AS TEXT)` : placeholder(index);
    const assertAgreement = (query: ReturnType<typeof Q.deserialize>) => {
      const before = query.serialize();
      const result = query.toSQLWithBindings(flavor);
      expect(query.toSQL(flavor)).toBe(inlineBindings(result, flavor));
      expect(query.serialize()).toBe(before);
      return result;
    };

    for (const [position, input] of identifiers.filter(
      ([name]) =>
        dialect !== "awsTimestream" ||
        !/INSERT|UPDATE|mutation|CTAS|CVAS/.test(name)
    )) {
      it.each(strings)(
        `${position} rejects %s encoding as an identifier`,
        (_name, value) => {
          rejects(input(value), "invalid_node");
        }
      );
    }

    for (const position of ["limit", "offset"] as const) {
      it.each(strings)(
        `${position.toUpperCase()} rejects %s string`,
        (_name, value) => {
          rejects({ ...select(), [position]: value }, "invalid_node");
        }
      );
      it.each([0, 1, 42])(
        `${position.toUpperCase()} integer %s agrees with bindings`,
        (value) => {
          const input = { ...select(), [position]: value };
          expect(() => validateSerializedQuery(input, guarded)).not.toThrow();
          const query = Q.deserialize(JSON.stringify(input), guarded);
          expect(assertAgreement(query)).toEqual({
            sql: `SELECT ${column("id")} FROM ${column(
              "users"
            )} ${position.toUpperCase()} ${placeholder(1)}`,
            bindings: [value],
          });
          expect(query.toSQL(flavor)).toBe(
            `SELECT ${column("id")} FROM ${column(
              "users"
            )} ${position.toUpperCase()} ${value}`
          );
          expect(summarize(query)).toEqual({
            tables: ["users"],
            columns: [{ table: undefined, name: "id" }],
            functions: [],
            hasRaw: false,
            hasUnion: false,
            maxDepth: 0,
            kind: "select",
          });
          const onTable = jest.fn();
          const onColumn = jest.fn();
          const onFunction = jest.fn();
          const onRaw = jest.fn();
          walk(query, { onTable, onColumn, onFunction, onRaw });
          expect(onTable.mock.calls).toEqual([["users", undefined, 0]]);
          expect(onColumn.mock.calls).toEqual([[undefined, "id"]]);
          expect(onFunction).not.toHaveBeenCalled();
          expect(onRaw).not.toHaveBeenCalled();
        }
      );
    }

    it("LIMIT and OFFSET preserve dialect binding order", () => {
      const query = Q.deserialize(
        JSON.stringify({ ...select(), limit: 5, offset: 2 }),
        guarded
      );
      const suffix =
        dialect === "awsTimestream"
          ? `OFFSET ${placeholder(1)} LIMIT ${placeholder(2)}`
          : `LIMIT ${placeholder(1)} OFFSET ${placeholder(2)}`;
      expect(assertAgreement(query)).toEqual({
        sql: `SELECT ${column("id")} FROM ${column("users")} ${suffix}`,
        bindings: dialect === "awsTimestream" ? [2, 5] : [5, 2],
      });
    });

    for (const [position, nest] of nestedQueries.filter(
      ([name]) =>
        dialect !== "awsTimestream" || !/INSERT|UPDATE|CTAS|CVAS/.test(name)
    )) {
      it(`${position} maxDepth accepts the boundary and rejects one level beyond it`, () => {
        const input = nest(select(typed("opaque")));
        rejects(input, "max_depth_exceeded");
        const options = { ...guarded, maxDepth: 1 };
        expect(() => validateSerializedQuery(input, options)).not.toThrow();
        const query = Q.deserialize(JSON.stringify(input), options);
        expect(summarize(query)).toMatchObject({
          maxDepth: 1,
          functions: [],
          hasRaw: false,
        });
        const onSubquery = jest.fn();
        const onTable = jest.fn();
        const onFunction = jest.fn();
        const onRaw = jest.fn();
        walk(query, { onSubquery, onTable, onFunction, onRaw });
        expect(onSubquery.mock.calls).toEqual([[1]]);
        expect(onTable.mock.calls.filter(([, , depth]) => depth === 1)).toEqual(
          [["users", undefined, 1]]
        );
        expect(onFunction).not.toHaveBeenCalled();
        expect(onRaw).not.toHaveBeenCalled();
        const result = assertAgreement(query);
        expect(result.bindings).toEqual(["opaque"]);
        expect(result.sql).toContain(
          `SELECT ${textPlaceholder(1)} FROM ${column("users")}`
        );
        const deeper = nest({
          ...select(),
          where: [{ type: "ExistsCondition", subquery: select() }],
        });
        rejects(deeper, "max_depth_exceeded", 1);
        const depthTwo = Q.deserialize(JSON.stringify(deeper), {
          ...guarded,
          maxDepth: 2,
        });
        expect(summarize(depthTwo).maxDepth).toBe(2);
        const depths: number[] = [];
        walk(depthTwo, { onSubquery: (depth) => depths.push(depth) });
        expect(depths).toEqual([1, 2]);
        expect(assertAgreement(depthTwo).sql).toContain("EXISTS (SELECT");
      });
    }

    // Invariant: a literal containing a SELECT does not add renderer-only depth.
    it("typed hidden EXISTS stays at maxDepth zero in the renderer", () => {
      const input = select(typed(hidden));
      expect(() => validateSerializedQuery(input, guarded)).not.toThrow();
      const query = Q.deserialize(JSON.stringify(input), guarded);
      expect(summarize(query)).toMatchObject({
        tables: ["users"],
        maxDepth: 0,
        hasRaw: false,
      });
      const onSubquery = jest.fn();
      walk(query, { onSubquery });
      expect(onSubquery).not.toHaveBeenCalled();
      expect(assertAgreement(query)).toEqual({
        sql: `SELECT ${textPlaceholder(1)} FROM ${column("users")}`,
        bindings: [hidden],
      });
    });

    for (const [name, value] of [
      ...strings.filter(([name]) =>
        ["function", "operation", "JSON object"].includes(name)
      ),
      ["JSON condition", hidden],
    ] as [string, string][]) {
      for (const slot of [
        "Binary value",
        "Between from",
        "Between to",
        "IN values",
        "NOT IN values",
      ]) {
        // Invariant: a plain string in a value slot stays data through constructors.
        it(`${slot} × unwrapped ${name} stays data`, () => {
          const condition =
            slot === "Binary value"
              ? binary(value)
              : slot.startsWith("Between")
              ? {
                  type: "BetweenCondition",
                  key: "id",
                  from: slot.endsWith("from") ? value : typed("fixed"),
                  to: slot.endsWith("to") ? value : typed("fixed"),
                }
              : {
                  type: slot === "IN values" ? "InCondition" : "NotInCondition",
                  key: "id",
                  values: [value],
                };
          const input = { ...select(), where: [condition] };
          expect(() => validateSerializedQuery(input, guarded)).not.toThrow();
          const query = Q.deserialize(JSON.stringify(input), guarded);
          const summary = {
            tables: ["users"],
            columns: [{ table: undefined, name: "id" }],
            functions: [],
            hasRaw: false,
            hasUnion: false,
            maxDepth: 0,
            kind: "select",
          };
          expect(summarize(query)).toEqual(summary);
          const onTable = jest.fn();
          const onColumn = jest.fn();
          const onFunction = jest.fn();
          const onRaw = jest.fn();
          walk(query, { onTable, onColumn, onFunction, onRaw });
          expect(onTable.mock.calls).toEqual([["users", undefined, 0]]);
          expect(onColumn.mock.calls).toEqual([
            [undefined, "id"],
            [undefined, "id"],
          ]);
          expect(onFunction).not.toHaveBeenCalled();
          expect(onRaw).not.toHaveBeenCalled();
          const result = assertAgreement(query);
          const values =
            slot === "Between from"
              ? [value, "fixed"]
              : slot === "Between to"
              ? ["fixed", value]
              : [value];
          const predicate =
            slot === "Binary value"
              ? `${column("id")} = ${placeholder(1)}`
              : slot.startsWith("Between")
              ? `${column("id")} BETWEEN ${placeholder(1)} AND ${placeholder(
                  2
                )}`
              : `${column("id")} ${
                  slot === "NOT IN values" ? "NOT " : ""
                }IN (${placeholder(1)})`;
          expect(result).toEqual({
            sql: `SELECT ${column("id")} FROM ${column(
              "users"
            )} WHERE ${predicate}`,
            bindings: values,
          });
          expect(summarize(query)).toEqual(summary);
        });
      }
    }

    it.each(strings)(
      "LIKE pattern × unwrapped %s is always data",
      (_name, value) => {
        const input = {
          ...select(),
          where: [
            { type: "LikeCondition", key: "id", pattern: value, isLike: true },
          ],
        };
        expect(() => validateSerializedQuery(input, guarded)).not.toThrow();
        const query = Q.deserialize(JSON.stringify(input), guarded);
        expect(assertAgreement(query)).toEqual({
          sql: `SELECT ${column("id")} FROM ${column("users")} WHERE ${column(
            "id"
          )} LIKE ${placeholder(1)}`,
          bindings: [value],
        });
        expect(summarize(query)).toMatchObject({
          tables: ["users"],
          functions: [],
          hasRaw: false,
          maxDepth: 0,
        });
      }
    );

    it("an explicit raw value is rejected before construction", () => {
      rejects(
        { ...select(), where: [binary('!!"SELECT secret FROM secrets"!!')] },
        "raw_not_allowed"
      );
    });

    for (const key of ["__proto__", "constructor"]) {
      it(`own ${key} metadata cannot add hidden query nodes or pollute prototypes`, () => {
        const input = JSON.parse(JSON.stringify(select()));
        // Define an own property without invoking Object.assign's __proto__ setter.
        Object.defineProperty(input, key, {
          enumerable: true,
          value: {
            polluted: true,
            type: "ExistsCondition",
            subquery: select(),
          },
        });
        expect(Object.prototype.hasOwnProperty.call(input, key)).toBe(true);
        expect(Object.getPrototypeOf(input)).toBe(Object.prototype);
        expect(() => validateSerializedQuery(input, guarded)).not.toThrow();
        const query = Q.deserialize(JSON.stringify(input), guarded);
        expect(assertAgreement(query)).toEqual({
          sql: `SELECT ${column("id")} FROM ${column("users")}`,
          bindings: [],
        });
        expect(summarize(query)).toEqual({
          tables: ["users"],
          columns: [{ table: undefined, name: "id" }],
          functions: [],
          maxDepth: 0,
          hasRaw: false,
          hasUnion: false,
          kind: "select",
        });
        const onTable = jest.fn();
        const onColumn = jest.fn();
        const onFunction = jest.fn();
        const onRaw = jest.fn();
        walk(query, { onTable, onColumn, onFunction, onRaw });
        expect(onTable.mock.calls).toEqual([["users", undefined, 0]]);
        expect(onColumn.mock.calls).toEqual([[undefined, "id"]]);
        expect(onFunction).not.toHaveBeenCalled();
        expect(onRaw).not.toHaveBeenCalled();
        expect((Object.prototype as any).polluted).toBeUndefined();
        expect(({} as any).polluted).toBeUndefined();
        expect(Object.getPrototypeOf(query)).toBe(
          Q.select().constructor.prototype
        );
      });

      it(`${key} is a quoted column and alias identifier`, () => {
        const input = {
          ...select(),
          fields: [{ name: key, alias: key }],
          tables: [{ ...table, alias: key }],
        };
        const query = Q.deserialize(JSON.stringify(input), guarded);
        expect(assertAgreement(query)).toEqual({
          sql: `SELECT ${column(key)} AS ${column(key)} FROM ${column(
            "users"
          )} AS ${column(key)}`,
          bindings: [],
        });
        const onColumn = jest.fn();
        const onTable = jest.fn();
        walk(query, { onColumn, onTable });
        expect(onColumn.mock.calls).toEqual([[undefined, key]]);
        expect(onTable.mock.calls).toEqual([["users", key, 0]]);
        expect(summarize(query)).toMatchObject({
          columns: [{ table: undefined, name: key }],
          tables: ["users"],
          hasRaw: false,
          functions: [],
          maxDepth: 0,
        });
      });
    }

    if (dialect !== "awsTimestream") {
      it.each(strings)(
        "INSERT rows × unwrapped %s keep exact scalar bytes",
        (_name, value) => {
          const input = {
            type: "InsertMutation",
            table,
            values: [{ id: value }, { id: value }],
          };
          expect(() => validateSerializedQuery(input, guarded)).not.toThrow();
          const query = Q.deserialize(JSON.stringify(input), guarded);
          const before = JSON.stringify(input);
          expect(query.serialize()).toBe(before);
          expect(assertAgreement(query)).toEqual({
            sql: `INSERT INTO ${column("users")} (${column(
              "id"
            )}) VALUES (${placeholder(1)}), (${placeholder(2)})`,
            bindings: [value, value],
          });
          expect(summarize(query)).toMatchObject({
            tables: ["users"],
            columns: [{ table: undefined, name: "id" }],
            functions: [],
            maxDepth: 0,
            hasRaw: false,
          });
          const onColumn = jest.fn();
          const onRaw = jest.fn();
          const onFunction = jest.fn();
          walk(query, { onColumn, onRaw, onFunction });
          expect(onColumn.mock.calls).toEqual([
            [undefined, "id"],
            [undefined, "id"],
          ]);
          expect(onRaw).not.toHaveBeenCalled();
          expect(onFunction).not.toHaveBeenCalled();
          expect(query.serialize()).toBe(before);
        }
      );
      for (const key of ["__proto__", "constructor"]) {
        it(`INSERT own ${key} column is preserved as data`, () => {
          const input = {
            type: "InsertMutation",
            table,
            values: [{ [key]: typed(hidden) }],
          };
          expect(() => validateSerializedQuery(input, guarded)).not.toThrow();
          const query = Q.deserialize(JSON.stringify(input), guarded);
          expect(assertAgreement(query)).toEqual({
            sql: `INSERT INTO ${column("users")} (${column(
              key
            )}) VALUES (${placeholder(1)})`,
            bindings: [typed(hidden)],
          });
          expect(query.serialize()).toBe(JSON.stringify(input));
          const onColumn = jest.fn();
          walk(query, { onColumn });
          expect(onColumn.mock.calls).toEqual([[undefined, key]]);
        });
      }
      it("UPDATE own __proto__ key is rejected before assigning to the AST", () => {
        rejects(
          {
            type: "UpdateMutation",
            table,
            values: { ["__proto__"]: typed(hidden) },
            where: [],
          },
          "invalid_node"
        );
        expect((Object.prototype as any).polluted).toBeUndefined();
      });
      it("UPDATE own constructor column survives deserialization and serialization", () => {
        const input = {
          type: "UpdateMutation",
          table,
          values: { constructor: typed("data") },
          where: [],
        };
        const query = Q.deserialize(JSON.stringify(input), guarded);
        expect(assertAgreement(query)).toEqual({
          sql: `UPDATE ${column("users")} SET ${column(
            "constructor"
          )} = ${placeholder(1)}`,
          bindings: ["data"],
        });
        expect(query.serialize()).toBe(JSON.stringify(input));
        const onColumn = jest.fn();
        walk(query, { onColumn });
        expect(onColumn.mock.calls).toEqual([[undefined, "constructor"]]);
      });
    }

    it("trusted Q.value and Cond.equal preserve output and exact serialize bytes", () => {
      const value = 'O\'Reilly says "? $1"';
      const query = Q.select()
        .field(Q.value(value), "ok")
        .from("users")
        .where(Cond.equal("id", Q.value(hidden)));
      const bytes = JSON.stringify({
        type: "SelectQuery",
        tables: [table],
        fields: [{ name: typed(value), alias: "ok" }],
        where: [binary(typed(hidden))],
      });
      expect(query.serialize()).toBe(bytes);
      expect(assertAgreement(query)).toEqual({
        sql: `SELECT ${textPlaceholder(1)} AS ${column("ok")} FROM ${column(
          "users"
        )} WHERE ${column("id")} = ${placeholder(2)}`,
        bindings: [value, hidden],
      });
      expect(query.toSQL(flavor)).toBe(
        `SELECT ${flavor.escapeValue(value)} AS ${column("ok")} FROM ${column(
          "users"
        )} WHERE ${column("id")} = ${flavor.escapeValue(hidden)}`
      );
      expect(summarize(query)).toEqual({
        tables: ["users"],
        columns: [{ table: undefined, name: "id" }],
        functions: [],
        hasRaw: false,
        hasUnion: false,
        maxDepth: 0,
        kind: "select",
      });
      const onColumn = jest.fn();
      const onRaw = jest.fn();
      const onFunction = jest.fn();
      walk(query, { onColumn, onRaw, onFunction });
      expect(onColumn.mock.calls).toEqual([[undefined, "id"]]);
      expect(onRaw).not.toHaveBeenCalled();
      expect(onFunction).not.toHaveBeenCalled();
      expect(query.serialize()).toBe(bytes);
      expect(Q.deserialize(bytes, guarded).serialize()).toBe(bytes);
    });

    it("trusted Q.raw keeps raw SQL visible to policy and serialize bytes unchanged", () => {
      const raw = Q.raw("CURRENT_TIMESTAMP");
      const query = Q.select().field(raw, "now").from("users");
      const bytes = JSON.stringify({
        type: "SelectQuery",
        tables: [table],
        fields: [{ name: '!!"CURRENT_TIMESTAMP"!!', alias: "now" }],
      });
      expect(raw.serialize()).toBe('!!"CURRENT_TIMESTAMP"!!');
      expect(query.serialize()).toBe(bytes);
      expect(assertAgreement(query)).toEqual({
        sql: `SELECT CURRENT_TIMESTAMP AS ${column("now")} FROM ${column(
          "users"
        )}`,
        bindings: [],
      });
      const onRaw = jest.fn();
      const onFunction = jest.fn();
      walk(query, { onRaw, onFunction });
      expect(onRaw).toHaveBeenCalledTimes(1);
      expect(onFunction).not.toHaveBeenCalled();
      expect(summarize(query)).toEqual({
        tables: ["users"],
        columns: [],
        functions: [],
        hasRaw: true,
        hasUnion: false,
        maxDepth: 0,
        kind: "select",
      });
      expect(Q.deserialize(bytes).serialize()).toBe(bytes);
      expect(() => Q.deserialize(bytes, guarded)).toThrow(
        expect.objectContaining({ code: "raw_not_allowed" })
      );
      expect(query.serialize()).toBe(bytes);
    });

    it("Date builder values and date wire encodings retain Date string bindings and serialize bytes", () => {
      const date = new Date("2024-01-02T03:04:05.000Z");
      const formattedDate = flavor.formatDateValue!(date);
      const wire = `!D!${date.valueOf()}!!`;
      const query = Q.select()
        .field(Q.value(date), "at")
        .from("users")
        .where(Cond.equal("created_at", date));
      const bytes = JSON.stringify({
        type: "SelectQuery",
        tables: [table],
        fields: [{ name: wire, alias: "at" }],
        where: [{ ...binary(wire), key: "created_at" }],
      });
      expect(query.serialize()).toBe(bytes);
      for (const node of [query, Q.deserialize(bytes, guarded)]) {
        expect(assertAgreement(node)).toEqual({
          sql: `SELECT ${textPlaceholder(1)} AS ${column("at")} FROM ${column(
            "users"
          )} WHERE ${column("created_at")} = ${placeholder(2)}`,
          bindings: [formattedDate, formattedDate],
        });
        expect(
          node
            .toSQLWithBindings(flavor)
            .bindings.every((value) => typeof value === "string")
        ).toBe(true);
        expect(node.toSQL(flavor)).toBe(
          `SELECT ${flavor.escapeValue(date)} AS ${column("at")} FROM ${column(
            "users"
          )} WHERE ${column("created_at")} = ${flavor.escapeValue(date)}`
        );
        expect(summarize(node)).toEqual({
          tables: ["users"],
          columns: [{ table: undefined, name: "created_at" }],
          functions: [],
          maxDepth: 0,
          hasRaw: false,
          hasUnion: false,
          kind: "select",
        });
        const onColumn = jest.fn();
        const onRaw = jest.fn();
        const onFunction = jest.fn();
        walk(node, { onColumn, onRaw, onFunction });
        expect(onColumn.mock.calls).toEqual([[undefined, "created_at"]]);
        expect(onRaw).not.toHaveBeenCalled();
        expect(onFunction).not.toHaveBeenCalled();
        expect(node.serialize()).toBe(bytes);
      }
    });
  }
);
