import { CreateViewAsSelect } from "./CreateViewAsSelect"; // Adjust the import path as needed
import { Cond } from "./Condition";
import { Q } from "./Query";
import { MySQLFlavor } from "./flavors/mysql";
import { MetadataOperationType } from "./interfaces";

describe("CreateViewAsSelect", () => {
  const initialSelectQuery = Q.select()
    .from("users", "u")
    .where(Cond.equal("u.id", 1));
  const viewName = "user_view";

  it("should clone itself correctly", () => {
    const cvas = Q.createOrReaplaceViewAs(viewName, initialSelectQuery);
    const clone = cvas.clone();

    expect(clone).not.toBe(cvas);
    expect(clone.toSQL(new MySQLFlavor())).toBe(cvas.toSQL(new MySQLFlavor()));
  });

  it("should generate the correct SQL with OR REPLACE", () => {
    const cvas = Q.createOrReaplaceViewAs(viewName, initialSelectQuery);
    const expectedSQL = `CREATE OR REPLACE VIEW \`${viewName}\` AS SELECT * FROM \`users\` AS \`u\` WHERE \`u\`.\`id\` = 1`;
    expect(cvas.toSQL(new MySQLFlavor())).toBe(expectedSQL);
  });

  it("should generate the correct SQL without OR REPLACE", () => {
    const cvas = Q.createViewAs(viewName, initialSelectQuery);
    const expectedSQL = `CREATE VIEW \`${viewName}\` AS SELECT * FROM \`users\` AS \`u\` WHERE \`u\`.\`id\` = 1`;
    expect(cvas.toSQL(new MySQLFlavor())).toBe(expectedSQL);
  });

  it("should serialize and deserialize correctly", () => {
    const cvas = Q.createTableAs(viewName, initialSelectQuery);
    const serialized = cvas.serialize();
    const deserialized = Q.deserialize(serialized);

    expect(deserialized.toSQL(new MySQLFlavor())).toEqual(
      cvas.toSQL(new MySQLFlavor())
    );
  });

  it("should fetch table names correctly", () => {
    const cvas = Q.createViewAs(viewName, initialSelectQuery);
    expect(cvas.getTableNames()).toEqual([viewName, "users"]);
  });

  it("should return correct operation type", () => {
    const cvas = Q.createViewAs(viewName, initialSelectQuery);
    expect(cvas.getOperationType()).toEqual(
      MetadataOperationType.CREATE_VIEW_AS
    );
  });
});
