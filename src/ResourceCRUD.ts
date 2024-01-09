export interface CRUDResourceProps {
  resourceName: string;
  resourceId?: string;
  projectId?: string;
  environment?: string;
}

export type CRUDResourceData = { [key: string]: unknown };
