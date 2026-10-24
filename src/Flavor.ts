import {
  ExpressionRawValue,
  ExpressionValue,
  FunctionExpression,
  OperationExpression,
} from "./Expression";
import { UnionType } from "./Query";

export interface ISQLFlavor {
  /** One-based placeholder index; defaults to `?` when omitted. */
  parameterPlaceholder?(index: number): string;
  /** Used by the binding renderer for flavor-specific literal syntax. */
  bindValue?(value: unknown): string;
  escapeColumn(name: string, legacy?: boolean): string;
  escapeTable(table: string): string;
  escapeRawValue(value: ExpressionRawValue): string;
  escapeValue(value: ExpressionValue): string;
  escapeLimitAndOffset(limit?: number, offset?: number): string;
  escapeFunction(fn: FunctionExpression): string;
  escapeOperation(fn: OperationExpression): string;
  escapeUnion(unionType: UnionType, leftSQL: string, rightSQL: string): string;
  escapeLikeCondition(
    column: string,
    pattern: string,
    isLike: boolean,
    caseInsensitive: boolean
  ): string;
}
