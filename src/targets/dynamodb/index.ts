// DynamoDB targets
export { DynamoDBPartiQLTarget } from "./DynamoDBPartiQLTarget";
export {
  DynamoDBNativeTarget,
  type DynamoDBNativeTargetOptions,
} from "./DynamoDBNativeTarget";

// DynamoDB types
export type {
  AttributeValue,
  ExpressionAttributeNameMap,
  ExpressionAttributeValueMap,
  DynamoDBQueryInput,
  DynamoDBScanInput,
  DynamoDBPutItemInput,
  DynamoDBUpdateItemInput,
  DynamoDBDeleteItemInput,
  DynamoDBBatchWriteRequest,
  DynamoDBBatchWriteItemInput,
  DynamoDBReadInput,
  DynamoDBWriteInput,
  DynamoDBInput,
} from "./types";
