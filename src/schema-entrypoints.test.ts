describe("Schema module initialization", () => {
  it("loads the package root independently and renders typed DDL", () => {
    jest.isolateModules(() => {
      const { Q, T } = require("./index");
      expect(
        Q.createTable("t").column("c", T.int32()).toSQL(Q.flavors.duckdb)
      ).toBe('CREATE TABLE "t" ("c" INTEGER)');
    });
  });
  it("loads the DDL module independently without a circular base class", () => {
    jest.isolateModules(() => {
      const { CreateTable } = require("./DDL");
      expect(new CreateTable("t").column("c", { kind: "int32" }).toSQL()).toBe(
        "CREATE TABLE `t` (`c` INT)"
      );
    });
  });
  it("loads the introspection module independently without a circular base class", () => {
    jest.isolateModules(() => {
      const { ShowSchemas } = require("./Introspection");
      expect(new ShowSchemas().serialize()).toBe('{"type":"ShowSchemas"}');
    });
  });
});
