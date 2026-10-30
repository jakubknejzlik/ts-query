import { Q, Cond, Fn, ISequelizableOptions, summarize } from "./index";
import { Expression } from "./Expression";
import { inlineBindings } from "./test-bindings";

const patients = () =>
  Q.select().field("id").from("patients", "p").where(Cond.like("name", "A%"));
const jobs = () => Q.select().field("j.id").from("jobs", "j");
const cases = [
  ["IN", () => jobs().where(Cond.in("j.patient_id", patients()))],
  ["NOT IN", () => jobs().where(Cond.notIn("j.patient_id", patients()))],
  ["EXISTS", () => jobs().where(Cond.exists(patients()))],
  ["NOT EXISTS", () => jobs().where(Cond.notExists(patients()))],
  ["HAVING", () => jobs().groupBy("j.id").having(Cond.in("j.id", patients()))],
  [
    "JOIN ON",
    () => jobs().join(Q.table("teams", "t"), Cond.in("t.id", patients())),
  ],
  [
    "two levels",
    () =>
      jobs().where(
        Cond.in(
          "j.id",
          patients().where(
            Cond.in("p.id", Q.select().field("id").from("teams", "t"))
          )
        )
      ),
  ],
  [
    "union member",
    () =>
      jobs().union(
        Q.select()
          .field("p.id")
          .from("patients", "p")
          .where(Cond.in("p.id", Q.select().field("id").from("teams", "t")))
      ),
  ],
  ["derived FROM", () => jobs().from(patients(), "j")],
  [
    "field/function/operation/NOT",
    () =>
      jobs().field(
        Fn.add(
          Fn.if(Cond.not(Cond.in("j.id", patients())), Q.value(1), Q.value(0)),
          Q.value(2)
        ),
        "flag"
      ),
  ],
  [
    "generic function argument",
    () =>
      jobs().field(
        Fn.sum(Fn.if(Cond.exists(patients()), Q.value(1), Q.value(0)))
      ),
  ],
  [
    "DATEADD argument",
    () =>
      jobs().field(
        Fn.dateAdd(
          Fn.if(
            Cond.exists(patients()),
            Q.value("2026-01-01"),
            Q.value("2026-02-01")
          ),
          1,
          "day"
        )
      ),
  ],
  [
    "GROUP BY",
    () =>
      jobs().groupBy(
        Fn.if(Cond.in("j.id", patients()), Q.value(1), Q.value(0))
      ),
  ],
  [
    "ORDER BY",
    () =>
      jobs().orderBy(
        Fn.if(Cond.in("j.id", patients()), Q.value(1), Q.value(0))
      ),
  ],
  [
    "INSERT SELECT",
    () =>
      Q.insert("archive").select(jobs().where(Cond.in("j.id", patients())), [
        "id",
      ]),
  ],
  [
    "UPDATE WHERE",
    () =>
      Q.update("jobs", "j")
        .set({ active: 1 })
        .where(Cond.in("j.id", patients())),
  ],
  ["UPDATE SET", () => Q.update("jobs", "j").set({ patient_id: patients() })],
  [
    "UPDATE SET expression",
    () =>
      Q.update("jobs", "j").set({
        active: Fn.if(Cond.exists(patients()), Q.value(1), Q.value(0)),
      }),
  ],
  [
    "DELETE WHERE",
    () => Q.delete("jobs", "j").where(Cond.notExists(patients())),
  ],
  [
    "CREATE TABLE AS",
    () => Q.createTableAs("archive", jobs().where(Cond.exists(patients()))),
  ],
  [
    "CREATE VIEW AS",
    () => Q.createViewAs("view", jobs().where(Cond.exists(patients()))),
  ],
] as const;

describe.each(["mysql", "postgres", "sqlite", "awsTimestream"] as const)(
  "%s subquery transforms",
  (name) => {
    const flavor = Q.flavors[name];
    it.each(cases)(
      "forwards table and SELECT transforms through %s",
      (_label, build) => {
        const query = build();
        const before = query.serialize();
        const tableNames: string[] = [];
        const selectTables: string[] = [];
        const options: ISequelizableOptions = {
          transformTable: (table) => {
            tableNames.push(table);
            return Q.select()
              .from(table)
              .where(Cond.equal("organization_id", "tenant-7"));
          },
          transformSelectQuery: (select) => {
            // Only modify original SELECTs, not the trusted table wrappers above.
            const table = select.table;
            if (table?.alias && typeof table.source === "string") {
              selectTables.push(table.source);
              return select.where(Cond.equal(`${table.alias}.role`, "reader"));
            }
            return select;
          },
        };
        const inline = query.toSQL(flavor, options);
        expect(tableNames).toContain("patients");
        expect(selectTables).toContain("patients");
        const expectedTables = summarize(query).tables.slice(
          _label.startsWith("INSERT") ||
            _label.startsWith("UPDATE") ||
            _label.startsWith("DELETE") ||
            _label.startsWith("CREATE")
            ? 1
            : 0
        );
        expect(new Set(tableNames)).toEqual(new Set(expectedTables));
        // Every source SELECT must be scoped, including the deepest nested table.
        if (
          _label === "two levels" ||
          _label === "union member" ||
          _label === "JOIN ON"
        ) {
          expect(expectedTables).toContain("teams");
        }
        for (const table of expectedTables) {
          expect(inline).toContain(
            `(SELECT * FROM ${flavor.escapeTable(
              table
            )} WHERE ${flavor.escapeColumn(
              "organization_id"
            )} = ${flavor.escapeValue("tenant-7")})`
          );
        }
        tableNames.length = 0;
        const bound = query.toSQLWithBindings(flavor, options);
        expect(tableNames.sort()).toEqual([...expectedTables].sort());
        expect(inlineBindings(bound, flavor)).toBe(inline);
        expect(bound.bindings).toContain("tenant-7");
        expect(bound.bindings).toContain("reader");
        expect(
          bound.bindings.filter((value) => value === "tenant-7")
        ).toHaveLength(expectedTables.length);
        const restored = Q.deserialize(before, { allowRaw: false });
        expect(restored.toSQL(flavor, options)).toBe(inline);
        expect(restored.toSQLWithBindings(flavor, options)).toEqual(bound);
        expect(query.serialize()).toBe(before);
      }
    );
  }
);

it("passes options through every condition operand and nested expression wrapper", () => {
  const predicate = Cond.exists(patients());
  const operands = [
    Cond.equal(predicate, true),
    Cond.equal("flag", predicate),
    Cond.between(predicate, [predicate, predicate]),
    Cond.in(predicate, [predicate]),
    Cond.notIn(predicate, [predicate]),
    Cond.isNull(predicate),
    Cond.like(predicate, "%"),
    Cond.columnEqual(predicate, predicate),
    Cond.not(Cond.and([predicate, Cond.or([predicate])])!),
    new Expression(new Expression(Fn.if(predicate, Q.value(1), Q.value(0)))),
  ];
  for (const operand of operands) {
    const seen: string[] = [];
    operand.toSQL(Q.flavors.sqlite, {
      transformTable: (name) => {
        seen.push(name);
        return `scoped_${name}`;
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set(["patients"]));
  }
});

it("preserves mutation transforms while forwarding SELECT transforms to their subqueries", () => {
  const options: ISequelizableOptions = {
    transformTable: (name) => `scoped_${name}`,
    transformSelectQuery: (query) => query.where(Cond.equal("role", "reader")),
    transformInsertMutation: (query) => query.select(patients()),
    transformUpdateMutation: (query) => query.where(Cond.exists(patients())),
    transformDeleteMutation: (query) => query.where(Cond.notExists(patients())),
  };
  for (const query of [
    Q.insert("archive"),
    Q.update("jobs").set({ active: true }),
    Q.delete("jobs"),
  ]) {
    const sql = query.toSQL(Q.flavors.sqlite, options);
    expect(sql).toContain("`scoped_patients`");
    expect(sql).toContain("`role` = 'reader'");
    expect(
      inlineBindings(
        query.toSQLWithBindings(Q.flavors.sqlite, options),
        Q.flavors.sqlite
      )
    ).toBe(sql);
  }
});
