import { Cond } from "./Condition";
import { Q } from "./Query";
import { MySQLFlavor } from "./flavors/mysql";
import { MetadataOperationType } from "./interfaces";

describe("CreateTableAsSelect", () => {
  const initialSelectQuery = Q.select()
    .from("users", "u")
    .where(Cond.equal("u.id", 1));
  const tableName = "new_users_table";

  it("should clone itself correctly", () => {
    const ctas = Q.createTableAs(tableName, initialSelectQuery);
    const clone = ctas.clone();

    expect(clone).not.toBe(ctas);
    expect(clone.toSQL(new MySQLFlavor())).toBe(ctas.toSQL(new MySQLFlavor()));
  });

  it("should generate the correct SQL", () => {
    const ctas = Q.createTableAs(tableName, initialSelectQuery);
    const expectedSQL = `CREATE TABLE \`${tableName}\` AS SELECT * FROM \`users\` AS \`u\` WHERE \`u\`.\`id\` = 1`;
    expect(ctas.toSQL(new MySQLFlavor())).toBe(expectedSQL);
  });

  it("should serialize and deserialize correctly", () => {
    const ctas = Q.createTableAs(tableName, initialSelectQuery);
    const serialized = ctas.serialize();
    const deserialized = Q.deserialize(serialized);

    expect(deserialized).toEqual(ctas);
    expect(deserialized.toSQL(new MySQLFlavor())).toBe(
      ctas.toSQL(new MySQLFlavor())
    );
  });

  it("should serialize and deserialize correctly with compression", () => {
    const ctas = Q.createTableAs(tableName, initialSelectQuery);

    const serializedCompressed = ctas.serialize({ compress: true });
    const deserializedCompressed = Q.deserialize(serializedCompressed);

    expect(deserializedCompressed).toEqual(ctas);
    expect(deserializedCompressed.toSQL(new MySQLFlavor())).toBe(
      ctas.toSQL(new MySQLFlavor())
    );
  });

  it("should fetch table names correctly", () => {
    const ctas = Q.createTableAs(tableName, initialSelectQuery);
    expect(ctas.getTableNames()).toEqual([tableName, "users"]);
  });

  it("should return correct operation type", () => {
    const ctas = Q.createTableAs(tableName, initialSelectQuery);
    expect(ctas.getOperationType()).toEqual(
      MetadataOperationType.CREATE_TABLE_AS
    );
  });

  it("should return correct values from accessorts", () => {
    const cvas = Q.createTableAs(tableName, initialSelectQuery);
    expect(cvas.getTableName()).toEqual(tableName);
    expect(cvas.getSelect().toSQL()).toEqual(initialSelectQuery.toSQL());
  });

  describe("composition - CTAS as table reference", () => {
    it("should use CTAS as table source in from()", () => {
      const ctas = Q.createTableAs(
        "users_v1",
        Q.select().from(Q.values([{ id: 1, name: "Alice" }]))
      );
      const query = Q.select().from(ctas);
      expect(query.toSQL(new MySQLFlavor())).toBe(
        "SELECT * FROM `users_v1`"
      );
    });

    it("should use CTAS as table source in another CTAS", () => {
      const ctas1 = Q.createTableAs(
        "users_v1",
        Q.select().from(Q.values([{ id: 1, name: "Alice" }]))
      );
      const ctas2 = Q.createTableAs("users_v2", Q.select().from(ctas1));
      expect(ctas2.toSQL(new MySQLFlavor())).toBe(
        "CREATE TABLE `users_v2` AS SELECT * FROM `users_v1`"
      );
    });

    it("should support alias when using CTAS as table source", () => {
      const ctas = Q.createTableAs(
        "users_v1",
        Q.select().from(Q.values([{ id: 1, name: "Alice" }]))
      );
      const query = Q.select().from(ctas, "u");
      expect(query.toSQL(new MySQLFlavor())).toBe(
        "SELECT * FROM `users_v1` AS `u`"
      );
    });

    it("should return correct table names when using CTAS as table source", () => {
      const ctas = Q.createTableAs("users_v1", Q.select().from("raw_users"));
      const query = Q.select().from(ctas);
      expect(query.getTableNames()).toEqual(["users_v1"]);
    });

    it("should use CVAS as table source in from()", () => {
      const cvas = Q.createViewAs("users_view", Q.select().from("users"));
      const query = Q.select().from(cvas);
      expect(query.toSQL(new MySQLFlavor())).toBe(
        "SELECT * FROM `users_view`"
      );
    });

    it("should serialize and deserialize query referencing CTAS", () => {
      const ctas = Q.createTableAs("users_v1", Q.select().from("raw_users"));
      const query = Q.select().from(ctas).where(Cond.equal("id", 1));
      const serialized = query.serialize();
      const deserialized = Q.deserialize(serialized);
      expect(deserialized.toSQL(new MySQLFlavor())).toBe(
        query.toSQL(new MySQLFlavor())
      );
    });
  });

  describe("OR REPLACE", () => {
    it("should generate CREATE OR REPLACE TABLE SQL", () => {
      const ctas = Q.createOrReplaceTableAs(tableName, initialSelectQuery);
      const expectedSQL = `CREATE OR REPLACE TABLE \`${tableName}\` AS SELECT * FROM \`users\` AS \`u\` WHERE \`u\`.\`id\` = 1`;
      expect(ctas.toSQL(new MySQLFlavor())).toBe(expectedSQL);
    });

    it("should clone and preserve orReplace flag", () => {
      const ctas = Q.createOrReplaceTableAs(tableName, initialSelectQuery);
      const clone = ctas.clone();
      expect(clone.toSQL(new MySQLFlavor())).toBe(ctas.toSQL(new MySQLFlavor()));
    });

    it("should serialize and deserialize correctly", () => {
      const ctas = Q.createOrReplaceTableAs(tableName, initialSelectQuery);
      const serialized = ctas.serialize();
      const deserialized = Q.deserialize(serialized);
      expect(deserialized.toSQL(new MySQLFlavor())).toBe(
        ctas.toSQL(new MySQLFlavor())
      );
    });
  });
});
