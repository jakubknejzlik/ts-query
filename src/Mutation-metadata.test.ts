import { Q } from "./Query";

describe("Query builder metadata", () => {
  it("should return list of tables in insert query", () => {
    const query = Q.insert("table");
    const tables = query.getTableNames();
    expect(tables).toEqual(["table"]);
  });
  it("should return list of tables in update query", () => {
    const query = Q.update("table");
    const tables = query.getTableNames();
    expect(tables).toEqual(["table"]);
  });
  it("should return list of tables in delete query", () => {
    const query = Q.delete("table");
    const tables = query.getTableNames();
    expect(tables).toEqual(["table"]);
  });
});
