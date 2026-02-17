import { Q } from "./Query";
import { MySQLFlavor } from "./flavors/mysql";

describe("Q.values", () => {
  it("should generate SELECT with UNION ALL for multiple rows", () => {
    const query = Q.values([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
    const sql = query.toSQL(new MySQLFlavor());
    expect(sql).toBe(
      `(SELECT 1 AS \`id\`, "Alice" AS \`name\` ) UNION ALL (SELECT 2, "Bob" )`
    );
  });

  it("should generate SELECT without UNION for single row", () => {
    const query = Q.values([{ id: 1 }]);
    const sql = query.toSQL(new MySQLFlavor());
    expect(sql).toBe(`SELECT 1 AS \`id\` `);
  });

  it("should handle null values", () => {
    const query = Q.values([{ id: null }]);
    const sql = query.toSQL(new MySQLFlavor());
    expect(sql).toBe(`SELECT NULL AS \`id\` `);
  });

  it("should handle undefined values as NULL", () => {
    const query = Q.values([{ id: undefined }]);
    const sql = query.toSQL(new MySQLFlavor());
    expect(sql).toBe(`SELECT NULL AS \`id\` `);
  });

  it("should compose with createTableAs", () => {
    const query = Q.createTableAs(
      "my_table",
      Q.values([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ])
    );
    const sql = query.toSQL(new MySQLFlavor());
    expect(sql).toBe(
      `CREATE TABLE \`my_table\` AS (SELECT 1 AS \`id\`, "Alice" AS \`name\` ) UNION ALL (SELECT 2, "Bob" )`
    );
  });

  it("should compose with createOrReplaceTableAs", () => {
    const query = Q.createOrReplaceTableAs(
      "my_table",
      Q.values([{ id: 1 }])
    );
    const sql = query.toSQL(new MySQLFlavor());
    expect(sql).toBe(
      `CREATE OR REPLACE TABLE \`my_table\` AS SELECT 1 AS \`id\` `
    );
  });

  it("should work as subquery source", () => {
    const query = Q.select().from(
      Q.values([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]),
      "data"
    );
    const sql = query.toSQL(new MySQLFlavor());
    expect(sql).toBe(
      `SELECT * FROM ((SELECT 1 AS \`id\`, "Alice" AS \`name\` ) UNION ALL (SELECT 2, "Bob" )) AS \`data\``
    );
  });

  it("should serialize and deserialize correctly", () => {
    const query = Q.values([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
    const serialized = query.serialize();
    const deserialized = Q.deserialize(serialized);
    expect(deserialized.toSQL(new MySQLFlavor())).toBe(
      query.toSQL(new MySQLFlavor())
    );
  });

  it("should throw for empty array", () => {
    expect(() => Q.values([])).toThrow("values requires at least one row");
  });

  it("should handle boolean values", () => {
    const query = Q.values([{ active: true }]);
    const sql = query.toSQL(new MySQLFlavor());
    expect(sql).toBe(`SELECT true AS \`active\` `);
  });
});
