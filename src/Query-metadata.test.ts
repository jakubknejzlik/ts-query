import { Q } from "./Query";

describe("Query builder metadata", () => {
  it("should return list of tables in simple query", () => {
    const query = Q.select().from("table");
    const tables = query.getTableNames();
    expect(tables).toEqual(["table"]);
  });
  it("should return list of tables in union query", () => {
    const query = Q.select().from("table").union(Q.select().from("table2"));
    const tables = query.getTableNames();
    expect(tables).toEqual(["table", "table2"]);
  });
  it("should return list of tables in complex query", () => {
    const query = Q.select()
      .from("table")
      .union(
        Q.select()
          .from("table2")
          .union(
            Q.select()
              .from("table3")
              .join(Q.table("table4"))
              .union(Q.select().from("table2"))
          )
      );
    const tables = query.getTableNames();
    expect(tables).toEqual(["table", "table2", "table3", "table4"]);
  });
  it("should return empty list of tables", () => {
    const query = Q.select();
    const tables = query.getTableNames();
    expect(tables).toEqual([]);
  });
});
