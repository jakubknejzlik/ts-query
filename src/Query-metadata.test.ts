import { Q } from "./Query";
import { Fn } from "./Function";
import { MetadataOperationType } from "./interfaces";

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
  it("should get empty table names form union", () => {
    const query = Q.select()
      .addField(Fn.string("label"), "label")
      .addField(Fn.string("0"), "value")
      .union(
        Q.select()
          .addField("label")
          .addField("val", "value")
          .from(
            Q.select()
              .addField(Fn.string("label"), "label")
              .union(
                Q.select()
                  .removeGroupBy()
                  .addField(Fn.string("label3"), "label")
              )
              .union(Q.select().addField(Fn.string("label"), "label"))
          )
      );
    const tables = query.getTableNames();
    expect(tables).toEqual([]);
  });

  it("should get operation type for query", () => {
    const query = Q.select();
    const operation = query.getOperationType();
    expect(operation).toEqual(MetadataOperationType.SELECT);
  });
});
