import { ISequelizableOptions } from "./interfaces";
import {
  ExpressionBase,
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
  /** Optional SELECT-field renderer; defaults to the field's own toSQL. */
  escapeSelectField?(
    field: ExpressionBase,
    options?: ISequelizableOptions
  ): string;
  escapeLimitAndOffset(limit?: number, offset?: number): string;
  /** Custom flavors must forward options when rendering nested arguments. */
  escapeFunction(
    fn: FunctionExpression,
    options?: ISequelizableOptions
  ): string;
  escapeOperation(
    fn: OperationExpression,
    options?: ISequelizableOptions
  ): string;
  escapeUnion(unionType: UnionType, leftSQL: string, rightSQL: string): string;
  escapeLikeCondition(
    column: string,
    pattern: string,
    isLike: boolean,
    caseInsensitive: boolean
  ): string;
}
