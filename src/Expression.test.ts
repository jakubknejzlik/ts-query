import dayjs from "dayjs";
import {
  Expression,
  ExpressionBase,
  RawExpression,
  ValueExpression,
} from "./Expression";
import { Q } from "./Query";
import { MySQLFlavor } from "./flavors/mysql";

import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

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

  it("DateExpression serialization", () => {
    const expr = new ValueExpression(new Date());
    expect(
      ExpressionBase.deserialize(
        ExpressionBase.deserialize(expr.serialize()).serialize()
      ).toSQL(flavor)
    ).toEqual(expr.toSQL(flavor));
    expect(expr.toSQL(flavor)).toEqual(
      `"` + dayjs(expr.value as Date).format("YYYY-MM-DD HH:mm:ss") + `"`
    );
  });

  it("Date value expression serialization", () => {
    const date = new Date();
    const expr = Q.expr(date);
    const expr2 = Q.exprValue(date);
    const expr3 = new ValueExpression(date);
    expect(expr.toSQL(flavor)).toEqual(
      `"` + dayjs(date).format("YYYY-MM-DD HH:mm:ss") + `"`
    );
    expect(
      ExpressionBase.deserialize(
        ExpressionBase.deserialize(expr.serialize()).serialize()
      ).toSQL(flavor)
    ).toEqual(expr.toSQL(flavor));
    expect(expr2.toSQL(flavor)).toEqual(expr.toSQL(flavor));
    expect(expr3.toSQL(flavor)).toEqual(expr.toSQL(flavor));
  });

  it("Date value expression serialization with timezones", () => {
    const timezone = "Europe/Prague";
    const flavorWithTimezone = new MySQLFlavor({ timezone });
    const date = new Date();
    const expr = Q.expr(date);
    const expr2 = Q.exprValue(date);
    const expr3 = new ValueExpression(date);
    expect(expr.toSQL(flavorWithTimezone)).toEqual(
      `"` + dayjs(date).tz(timezone).format("YYYY-MM-DD HH:mm:ss") + `"`
    );
    expect(
      ExpressionBase.deserialize(
        ExpressionBase.deserialize(expr.serialize()).serialize()
      ).toSQL(flavorWithTimezone)
    ).toEqual(expr.toSQL(flavorWithTimezone));
    expect(expr2.toSQL(flavorWithTimezone)).toEqual(
      expr.toSQL(flavorWithTimezone)
    );
    expect(expr3.toSQL(flavorWithTimezone)).toEqual(
      expr.toSQL(flavorWithTimezone)
    );
  });
});
