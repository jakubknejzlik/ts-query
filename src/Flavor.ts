import { ConditionValue } from "./Condition";
import { FunctionExpression, OperationExpression } from "./Expression";

export interface ISQLFlavor {
  escapeColumn(name: string, legacy?: boolean): string;
  escapeTable(table: string): string;
  escapeValue(value: ConditionValue): string;
  escapeLimitAndOffset(limit?: number, offset?: number): string;
  escapeFunction(fn: FunctionExpression): string;
  escapeOperation(fn: OperationExpression): string;
}
