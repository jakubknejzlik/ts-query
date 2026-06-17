/**
 * Type definitions for DynamoDB target outputs.
 * These mirror the AWS SDK types but are self-contained to avoid requiring aws-sdk as a dependency.
 */

// Attribute value types
export type AttributeValue =
  | { S: string }
  | { N: string }
  | { B: Buffer | Uint8Array }
  | { SS: string[] }
  | { NS: string[] }
  | { BS: (Buffer | Uint8Array)[] }
  | { M: Record<string, AttributeValue> }
  | { L: AttributeValue[] }
  | { NULL: boolean }
  | { BOOL: boolean };

// Expression attribute names map (#name -> actual name)
export type ExpressionAttributeNameMap = Record<string, string>;

// Expression attribute values map (:value -> AttributeValue)
export type ExpressionAttributeValueMap = Record<string, AttributeValue>;

/**
 * DynamoDB Query input parameters
 */
export interface DynamoDBQueryInput {
  TableName: string;
  IndexName?: string;
  KeyConditionExpression?: string;
  FilterExpression?: string;
  ProjectionExpression?: string;
  ExpressionAttributeNames?: ExpressionAttributeNameMap;
  ExpressionAttributeValues?: ExpressionAttributeValueMap;
  Limit?: number;
  ScanIndexForward?: boolean;
  ExclusiveStartKey?: Record<string, AttributeValue>;
  Select?: "ALL_ATTRIBUTES" | "ALL_PROJECTED_ATTRIBUTES" | "SPECIFIC_ATTRIBUTES" | "COUNT";
  ConsistentRead?: boolean;
}

/**
 * DynamoDB Scan input parameters
 */
export interface DynamoDBScanInput {
  TableName: string;
  IndexName?: string;
  FilterExpression?: string;
  ProjectionExpression?: string;
  ExpressionAttributeNames?: ExpressionAttributeNameMap;
  ExpressionAttributeValues?: ExpressionAttributeValueMap;
  Limit?: number;
  ExclusiveStartKey?: Record<string, AttributeValue>;
  Select?: "ALL_ATTRIBUTES" | "ALL_PROJECTED_ATTRIBUTES" | "SPECIFIC_ATTRIBUTES" | "COUNT";
  ConsistentRead?: boolean;
  Segment?: number;
  TotalSegments?: number;
}

/**
 * DynamoDB PutItem input parameters
 */
export interface DynamoDBPutItemInput {
  TableName: string;
  Item: Record<string, AttributeValue>;
  ConditionExpression?: string;
  ExpressionAttributeNames?: ExpressionAttributeNameMap;
  ExpressionAttributeValues?: ExpressionAttributeValueMap;
  ReturnValues?: "NONE" | "ALL_OLD";
}

/**
 * DynamoDB UpdateItem input parameters
 */
export interface DynamoDBUpdateItemInput {
  TableName: string;
  Key: Record<string, AttributeValue>;
  UpdateExpression: string;
  ConditionExpression?: string;
  ExpressionAttributeNames?: ExpressionAttributeNameMap;
  ExpressionAttributeValues?: ExpressionAttributeValueMap;
  ReturnValues?: "NONE" | "ALL_OLD" | "UPDATED_OLD" | "ALL_NEW" | "UPDATED_NEW";
}

/**
 * DynamoDB DeleteItem input parameters
 */
export interface DynamoDBDeleteItemInput {
  TableName: string;
  Key: Record<string, AttributeValue>;
  ConditionExpression?: string;
  ExpressionAttributeNames?: ExpressionAttributeNameMap;
  ExpressionAttributeValues?: ExpressionAttributeValueMap;
  ReturnValues?: "NONE" | "ALL_OLD";
}

/**
 * DynamoDB BatchWriteItem request item
 */
export interface DynamoDBBatchWriteRequest {
  PutRequest?: { Item: Record<string, AttributeValue> };
  DeleteRequest?: { Key: Record<string, AttributeValue> };
}

/**
 * DynamoDB BatchWriteItem input parameters
 */
export interface DynamoDBBatchWriteItemInput {
  RequestItems: Record<string, DynamoDBBatchWriteRequest[]>;
}

/**
 * Union type for all DynamoDB read operations
 */
export type DynamoDBReadInput = DynamoDBQueryInput | DynamoDBScanInput;

/**
 * Union type for all DynamoDB write operations
 */
export type DynamoDBWriteInput =
  | DynamoDBPutItemInput
  | DynamoDBUpdateItemInput
  | DynamoDBDeleteItemInput
  | DynamoDBBatchWriteItemInput;

/**
 * Union type for all DynamoDB operations (used as target output)
 */
export type DynamoDBInput =
  | DynamoDBQueryInput
  | DynamoDBScanInput
  | DynamoDBPutItemInput
  | DynamoDBUpdateItemInput
  | DynamoDBDeleteItemInput
  | DynamoDBBatchWriteItemInput;
