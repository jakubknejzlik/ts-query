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
});
