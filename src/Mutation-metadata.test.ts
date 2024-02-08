import { Q } from "./Query";
import { MetadataOperationType } from "./interfaces";

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
  it("should get operation type", () => {
    expect(Q.insert("table").getOperationType()).toEqual(
      MetadataOperationType.INSERT
    );
    expect(Q.update("table").getOperationType()).toEqual(
      MetadataOperationType.UPDATE
    );
    expect(Q.delete("table").getOperationType()).toEqual(
      MetadataOperationType.DELETE
    );
  });
});
