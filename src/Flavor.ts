import { ConditionValue } from "./Condition";

export interface ISQLFlavor {
  escapeColumn(name: string): string;
  escapeTable(table: string): string;
  escapeValue(value: ConditionValue): string;
}
