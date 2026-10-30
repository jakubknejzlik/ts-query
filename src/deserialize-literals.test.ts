import { Q, Cond, walk, summarize } from "./index";
import { ExpressionBase } from "./Expression";

const encoded = (value: string) => "!!!" + JSON.stringify(value);
const select = (name: string) => ({
  type: "SelectQuery",
  tables: [{ type: "Table", source: "users", alias: "u" }],
  fields: [{ name, alias: "ok" }],
});
const binary = (key: string, value = "!!!1") => ({
  type: "BinaryCondition",
  key,
  value,
  operator: "=",
});
const rawCondition = JSON.stringify(
  binary('!!"(SELECT secret FROM secrets LIMIT 1)"!!')
);
const hiddenExists = JSON.stringify({
  type: "ExistsCondition",
  subquery: {
    type: "SelectQuery",
    tables: [{ type: "Table", source: "secrets" }],
    fields: [{ name: "id" }],
  },
});
const deniedFunction = JSON.stringify(binary('FN(["RANDOM"])'));
const literal = encoded(hiddenExists);
const table = { type: "Table", source: "users" };

describe.each(["sqlite", "mysql", "postgres"] as const)(
  "Opaque typed literals (%s)",
  (dialect) => {
    const flavor = Q.flavors[dialect];
    const quote = dialect === "postgres" ? '"' : "`";
    const column = (name: string) => `${quote}${name}${quote}`;
    const parameter = (index: number) =>
      dialect === "postgres" ? `$${index}` : "?";

    // Invariant: render-time expression reparsing must not turn literals into nodes (PR #18).
    it.failing.each([
      ["raw condition", rawCondition, encoded(rawCondition), false],
      ["hidden table/depth", hiddenExists, literal, false],
      [
        "hidden table in function argument",
        hiddenExists,
        `FN(${JSON.stringify(["COUNT", literal])})`,
        true,
      ],
      ["denied function", deniedFunction, encoded(deniedFunction), false],
    ] as const)(
      "binds the %s payload as data",
      (_, value, name, inFunction) => {
        const query = Q.deserialize(JSON.stringify(select(name)), {
          allowRaw: false,
          functions: ["COUNT"],
          maxDepth: 0,
        });
        const expectedSummary = {
          tables: ["users"],
          columns: [],
          functions: inFunction ? ["COUNT"] : [],
          maxDepth: 0,
          hasRaw: false,
          hasUnion: false,
          kind: "select",
        };
        expect(summarize(query)).toEqual(expectedSummary);
        const onTable = jest.fn((name: string) => expect(name).toBe("users"));
        const onColumn = jest.fn();
        const onFunction = jest.fn((name: string) =>
          expect(name).toBe("COUNT")
        );
        const onRaw = jest.fn();
        const onSubquery = jest.fn();
        walk(query, { onTable, onColumn, onFunction, onRaw, onSubquery });
        expect(onTable).toHaveBeenCalledWith("users", "u", 0);
        expect(onTable).toHaveBeenCalledTimes(1);
        expect(onColumn).not.toHaveBeenCalled();
        expect(onFunction).toHaveBeenCalledTimes(inFunction ? 1 : 0);
        expect(onRaw).not.toHaveBeenCalled();
        expect(onSubquery).not.toHaveBeenCalled();

        const options = {
          transformTable: (name: string) =>
            Q.select().from(name).where(Cond.equal("tenant_id", "t1")),
        };
        const projection = (value: string) =>
          inFunction ? `COUNT(${value})` : value;
        const sql = (value: string, tenant: string) =>
          `SELECT ${projection(value)} AS ${column(
            "ok"
          )} FROM (SELECT * FROM ${column("users")} WHERE ${column(
            "tenant_id"
          )} = ${tenant}) AS ${column("u")}`;
        const result = query.toSQLWithBindings(flavor, options);
        expect(result).toEqual({
          sql: sql(parameter(1), parameter(2)),
          bindings: [value, "t1"],
        });
        expect(result.sql).not.toMatch(/secrets|RANDOM|EXISTS|SELECT secret/);
        expect(query.toSQL(flavor, options)).toBe(
          sql(flavor.escapeValue(value), flavor.escapeValue("t1"))
        );
        expect(summarize(query)).toEqual(expectedSummary);
        expect(JSON.parse(query.serialize()).fields).toEqual(
          select(name).fields
        );
      }
    );

    const positionCases = [
      [
        "condition key",
        { ...select("id"), where: [binary(literal)] },
        [hiddenExists, 1],
        0,
      ],
      [
        "condition value",
        { ...select("id"), where: [binary("id", literal)] },
        [hiddenExists],
        0,
      ],
      [
        "operation argument",
        select(`OP(${JSON.stringify(["+", literal, "!!!1"])})`),
        [hiddenExists, 1],
        0,
      ],
      [
        "ORDER BY",
        { ...select("id"), orderBy: [{ field: literal, direction: "ASC" }] },
        [hiddenExists],
        0,
      ],
      ["GROUP BY", { ...select("id"), groupBy: [literal] }, [hiddenExists], 0],
      [
        "HAVING",
        { ...select("id"), having: [binary(literal)] },
        [hiddenExists, 1],
        0,
      ],
      [
        "IN list",
        {
          ...select("id"),
          where: [{ type: "InCondition", key: "id", values: [literal] }],
        },
        [hiddenExists],
        0,
      ],
      [
        "NOT IN list",
        {
          ...select("id"),
          where: [{ type: "NotInCondition", key: "id", values: [literal] }],
        },
        [hiddenExists],
        0,
      ],
      [
        "BETWEEN values",
        {
          ...select("id"),
          where: [
            { type: "BetweenCondition", key: "id", from: literal, to: literal },
          ],
        },
        [hiddenExists, hiddenExists],
        0,
      ],
      // INSERT rows are scalar data on the wire; their encoding is never decoded.
      [
        "INSERT values",
        { type: "InsertMutation", table, values: [{ id: literal }] },
        [literal],
        0,
      ],
      [
        "UPDATE SET",
        { type: "UpdateMutation", table, values: { id: literal }, where: [] },
        [hiddenExists],
        0,
      ],
      [
        "union operand",
        {
          ...select("id"),
          unionQueries: [{ type: "UNION", query: select(literal) }],
        },
        [hiddenExists],
        1,
      ],
      [
        "INSERT SELECT",
        { type: "InsertMutation", table, select: [select(literal), ["id"]] },
        [hiddenExists],
        1,
      ],
      [
        "UPDATE subquery",
        {
          type: "UpdateMutation",
          table,
          values: { id: JSON.stringify(select(literal)) },
          where: [],
        },
        [hiddenExists],
        1,
      ],
      [
        "CTAS",
        { type: "ctas", tableName: "archive", select: select(literal) },
        [hiddenExists],
        1,
      ],
      [
        "CVAS",
        { type: "cvas", viewName: "archive", select: select(literal) },
        [hiddenExists],
        1,
      ],
    ] as const;
    const failingPositions = [
      "condition key",
      "operation argument",
      "HAVING",
      "BETWEEN values",
      "union operand",
      "INSERT SELECT",
      "UPDATE subquery",
      "CTAS",
      "CVAS",
    ];
    for (const [position, input, bindings, maxDepth] of positionCases) {
      // Invariant: accepted literal bytes must agree with the visited and rendered AST.
      const test = failingPositions.includes(position) ? it.failing : it;
      test(`keeps literals opaque in ${position}`, () => {
        const query = Q.deserialize(JSON.stringify(input), {
          allowRaw: false,
          functions: [],
          maxDepth: maxDepth as number,
        });
        const before = query.serialize();
        const summary = summarize(query);
        expect(summary).toMatchObject({
          tables:
            "tableName" in input || "viewName" in input
              ? ["archive", "users"]
              : ["users"],
          functions: [],
          hasRaw: false,
          maxDepth,
        });
        walk(query, {
          onTable: (name) => expect(summary.tables).toContain(name),
          onColumn: (_, name) => expect(name).toBe("id"),
          onFunction: () => {
            throw new Error("Unexpected function");
          },
          onRaw: () => {
            throw new Error("Unexpected raw SQL");
          },
          onSubquery: (depth) => expect(depth).toBe(maxDepth),
        });
        const result = query.toSQLWithBindings(flavor);
        expect(result.bindings).toEqual(bindings);
        expect(result.sql).not.toMatch(/secrets|RANDOM|EXISTS|SELECT secret/);
        expect(query.toSQL(flavor)).toContain(flavor.escapeValue(bindings[0]));
        expect(summarize(query)).toEqual(summary);
        expect(query.serialize()).toBe(before);
      });
    }

    // Invariant: a trusted ValueExpression keeps its identity and serialized bytes.
    it.failing.each(['{"type":"BinaryCondition"}', rawCondition])(
      "preserves trusted Q.value(%s) as a literal",
      (value) => {
        const node = Q.value(value);
        expect(ExpressionBase.deserialize(node)).toBe(node);
        expect(node.serialize()).toBe(encoded(value));
        const query = Q.select()
          .field(node, "ok")
          .from("users")
          .where(Cond.equal("id", Q.value("x")));
        expect(query.toSQLWithBindings(flavor)).toEqual({
          sql: `SELECT ${parameter(1)} AS ${column("ok")} FROM ${column(
            "users"
          )} WHERE ${column("id")} = ${parameter(2)}`,
          bindings: [value, "x"],
        });
        expect(JSON.parse(query.serialize()).fields).toEqual([
          { name: encoded(value), alias: "ok" },
        ]);
      }
    );
  }
);
