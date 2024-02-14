import { Expression, ExpressionBase } from "./Expression";
import { Q } from "./Query";

const flavor = Q.flavors.mysql;

describe("Expression", () => {
  it("should handle escaping columns", () => {
    expect(Q.expr(Expression.escapeColumn("foo")).toSQL(flavor)).toEqual(
      "`foo`"
    );
    expect(Q.expr(Expression.escapeColumn("123")).toSQL(flavor)).toEqual(
      "`123`"
    );
    expect(
      Q.expr(Expression.escapeColumn("aaa.ěščřžýáíé1%_-!")).toSQL(flavor)
    ).toEqual("`aaa`.`ěščřžýáíé1%_-!`");
  });
  it("should handle escaping columns in functions", () => {
    expect(
      Q.expr(`MAX(${Expression.escapeColumn("foo")})`).toSQL(flavor)
    ).toEqual("MAX(`foo`)");
    expect(
      Q.expr(
        `IF(${Expression.escapeColumn("123")} > 123,${Expression.escapeColumn(
          "123"
        )},FALSE)`
      ).toSQL(flavor)
    ).toEqual("IF(`123` > 123,`123`,FALSE)");
  });
});

describe("Expression serialization", () => {
  it("should serialize/deserialize expressions", () => {
    const a = Q.expr("foo").serialize();
    expect(ExpressionBase.deserialize(a).toSQL(flavor)).toEqual(
      Q.expr("foo").toSQL(flavor)
    );

    expect(Q.expr(Expression.escapeColumn("foo")).toSQL(flavor)).toEqual(
      ExpressionBase.deserialize(Expression.escapeColumn("foo")).toSQL(flavor)
    );

    expect(Q.expr(Expression.escapeString("blah")).toSQL(flavor)).toEqual(
      ExpressionBase.deserialize(Expression.escapeString("blah")).toSQL(flavor)
    );
  });

  it("should serialize/deserialize expressions multiple times", () => {
    const expr = Q.expr("foo");
    expect(
      ExpressionBase.deserialize(
        ExpressionBase.deserialize(expr.serialize()).serialize()
      ).toSQL(flavor)
    ).toEqual(expr.toSQL(flavor));

    const expr2 = Q.exprValue(123);
    expect(
      ExpressionBase.deserialize(
        ExpressionBase.deserializeValue(
          ExpressionBase.deserializeValue(expr2.serialize()).serialize()
        ).serialize()
      ).toSQL(flavor)
    ).toEqual(expr2.toSQL(flavor));
  });
});
