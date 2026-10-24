import { execFileSync } from "child_process";
import {
  Q,
  Cond,
  Fn,
  Condition,
  SelectQuery,
  ExistsCondition,
  NotExistsCondition,
  DeserializeError,
  walk,
  summarize,
  ISQLFlavor,
} from "./index";

const correlated = () =>
  Q.select()
    .field("p.id")
    .from("patients", "p")
    .where(Cond.columnEqual("p.id", "j.patient_id"))
    .where(Cond.equal("p.active", true));

const modes = [
  ["EXISTS", Cond.exists, ExistsCondition],
  ["NOT EXISTS", Cond.notExists, NotExistsCondition],
] as const;

describe.each(modes)("%s", (keyword, make, Node) => {
  it.each(["mysql", "postgres", "sqlite", "awsTimestream"] as const)(
    "renders correlated SQL and ordered bindings for %s",
    (name) => {
      const flavor: ISQLFlavor = Q.flavors[name];
      const condition = make(correlated());
      expect(condition).toBeInstanceOf(Node);
      expect(condition.toSQL(flavor)).toBe(
        `${keyword} (${correlated().toSQL(flavor)})`
      );
      expect(condition.toSQLWithBindings(flavor)).toEqual({
        sql: `${keyword} (SELECT ${flavor.escapeColumn(
          "p.id"
        )} FROM ${flavor.escapeTable("patients")} AS ${flavor.escapeColumn(
          "p"
        )} WHERE ${flavor.escapeColumn("p.id")} = ${flavor.escapeColumn(
          "j.patient_id"
        )} AND ${flavor.escapeColumn("p.active")} = ${
          flavor.parameterPlaceholder?.(1) ?? "?"
        })`,
        bindings: [true],
      });
    }
  );

  it.each([false, true])(
    "round-trips standalone conditions and guarded v1 query envelopes (compressed=%s)",
    (compress) => {
      const condition = make(correlated());
      expect(
        Condition.deserialize(condition.serialize())?.toSQL(Q.flavors.postgres)
      ).toBe(condition.toSQL(Q.flavors.postgres));
      const query = Q.select().from("jobs", "j").where(condition);
      const computed = Q.select()
        .from("jobs", "j")
        .field(Fn.if(condition, Q.value(1), Q.value(0)), "permitted");
      const restoredComputed = Q.deserialize(
        computed.serialize({ version: 1, compress }),
        {
          allowRaw: false,
          functions: ["IF"],
          maxDepth: 1,
        }
      );
      expect(restoredComputed.toSQLWithBindings()).toEqual(
        computed.toSQLWithBindings()
      );
      expect(summarize(restoredComputed)).toMatchObject({
        tables: ["patients", "jobs"],
        maxDepth: 1,
        functions: ["IF"],
      });
      for (const version of [undefined, 1] as const) {
        const encoded = query.serialize({ version, compress });
        const restored = Q.deserialize(encoded, {
          allowRaw: false,
          functions: [],
          maxDepth: 1,
        });
        expect(restored).toBeInstanceOf(SelectQuery);
        expect(restored.toSQL()).toBe(query.toSQL());
        expect(restored.toSQLWithBindings()).toEqual(query.toSQLWithBindings());
      }
    }
  );

  it("counts nested predicates in walk, summarize and strict maxDepth", () => {
    const query = Q.select()
      .from("jobs", "j")
      .where(make(correlated().where(make(Q.select().from("memberships")))));
    const before = query.serialize();
    const tables: any[] = [];
    const depths: number[] = [];
    walk(query, {
      onTable: (name, alias, depth) => tables.push([name, alias, depth]),
      onSubquery: (depth) => depths.push(depth),
    });
    expect(tables).toEqual([
      ["jobs", "j", 0],
      ["patients", "p", 1],
      ["memberships", undefined, 2],
    ]);
    expect(depths).toEqual([1, 2]);
    expect(summarize(query)).toMatchObject({
      tables: ["jobs", "patients", "memberships"],
      maxDepth: 2,
      hasRaw: false,
    });
    expect(summarize(query).columns).toContainEqual({
      table: "j",
      name: "patient_id",
    });
    expect(query.serialize()).toBe(before);
    expect(() =>
      Q.deserialize(query.serialize({ version: 1 }), { maxDepth: 1 })
    ).toThrow(expect.objectContaining({ code: "max_depth_exceeded" }));
    expect(
      Q.deserialize(query.serialize(), { allowRaw: false, maxDepth: 2 }).toSQL()
    ).toBe(query.toSQL());
  });

  it("enforces raw/function guards inside the subquery", () => {
    expect(() =>
      Q.deserialize(
        Q.select()
          .where(make(Q.select().field(Q.raw("secret()"))))
          .serialize({ version: 1 }),
        { allowRaw: false }
      )
    ).toThrow(expect.objectContaining({ code: "raw_not_allowed" }));
    const json = Q.select().where(make(correlated())).toJSON();
    json.where[0].subquery.fields = [{ name: 'FN(["SECRET","id"])' }];
    expect(() =>
      Q.deserialize(JSON.stringify(json), { functions: [] })
    ).toThrow(expect.objectContaining({ code: "function_not_allowed" }));
    json.where[0].subquery.v = 2;
    expect(() => Q.deserialize(JSON.stringify(json), {})).toThrow(
      expect.objectContaining({ code: "unsupported_version" })
    );
  });

  it.each([
    undefined,
    null,
    {},
    {
      type: "DeleteMutation",
      table: { type: "Table", source: "patients" },
      where: [],
    },
  ])("rejects a missing or non-SELECT subquery (%#)", (subquery) => {
    const json = Q.select().where(make(correlated())).toJSON();
    json.where[0].subquery = subquery;
    expect(() =>
      Q.deserialize(JSON.stringify({ v: 1, ...json }), { allowRaw: false })
    ).toThrow(DeserializeError);
  });

  it("rejects non-SELECT runtime inputs", () => {
    expect(() => make(Q.delete("patients") as any)).toThrow(TypeError);
  });
});

// Use the local Python SQLite adapter, as in the branch's SQLite smoke comparisons.
const sqliteRows = (queries: { sql: string; bindings?: unknown[] }[]) =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import json, sqlite3, sys
conn = sqlite3.connect(':memory:')
conn.executescript('''
CREATE TABLE jobs (id INTEGER, patient_id INTEGER, organization_id INTEGER);
CREATE TABLE patients (id INTEGER, organization_id INTEGER);
INSERT INTO jobs VALUES (1, 10, 7), (2, 20, 7), (3, NULL, 7), (4, 30, 8);
INSERT INTO patients VALUES (10, 7), (NULL, 7), (20, 8), (30, 8);
''')
print(json.dumps([conn.execute(q['sql'], q.get('bindings', [])).fetchall() for q in json.load(sys.stdin)]))
`,
      ],
      { input: JSON.stringify(queries), encoding: "utf8" }
    )
  );

it("preserves outer correlation through tenant wrappers and demonstrates NOT IN NULL semantics", () => {
  const base = Q.select().field("j.id").from("jobs", "j");
  const matching = Q.select().field("p.id").from("patients", "p");
  const queries = [
    base.where(Cond.notIn("j.patient_id", matching)),
    base.where(
      Cond.notExists(matching.where(Cond.columnEqual("p.id", "j.patient_id")))
    ),
    base.where(
      Cond.exists(matching.where(Cond.columnEqual("p.id", "j.patient_id")))
    ),
  ].map((query) => query.orderBy("j.id"));
  const options = {
    transformTable: (name: string) =>
      Q.select().from(name).where(Cond.equal("organization_id", 7)),
  };
  const rendered = queries.flatMap((query) => [
    { sql: query.toSQL(Q.flavors.sqlite, options), bindings: [] },
    query.toSQLWithBindings(Q.flavors.sqlite, options),
  ]);
  expect(rendered[3].sql).toContain("AS `j` WHERE NOT EXISTS");
  expect(rendered[3].sql).toContain("AS `p` WHERE `p`.`id` = `j`.`patient_id`");
  expect(rendered[3].bindings).toEqual([7, 7]);
  expect(sqliteRows(rendered)).toEqual([
    [],
    [],
    [[2], [3]],
    [[2], [3]],
    [[1]],
    [[1]],
  ]);
});
