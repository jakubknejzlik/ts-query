import { ConditionValue } from "./Condition";

export interface ISQLFlavor {
  escapeColumn(name: string, legacy?: boolean): string;
  escapeTable(table: string): string;
  escapeValue(value: ConditionValue): string;
}
