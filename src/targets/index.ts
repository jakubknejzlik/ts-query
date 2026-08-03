// Query targets for compiling queries to different backends
export { SQLTarget } from "./SQLTarget";

// DynamoDB targets
export {
  DynamoDBPartiQLTarget,
  DynamoDBNativeTarget,
  type DynamoDBNativeTargetOptions,
} from "./dynamodb";

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
} from "./dynamodb";
