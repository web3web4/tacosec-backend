/**
 * Interface for contact synchronization operations
 */
export interface IContactSync {
  userId: number;
  syncedAt: Date;
  totalContacts: number;
  newContacts: number;
  updatedContacts: number;
  deletedContacts: number;
  errors: string[];
}

/**
 * Contact sync status
 */
export enum ContactSyncStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Contact sync options
 */
export interface IContactSyncOptions {
  forceFullSync?: boolean;
  batchSize?: number;
  includePhotos?: boolean;
  filterOptions?: {
    excludeBots?: boolean;
    excludeDeleted?: boolean;
    onlyMutualContacts?: boolean;
  };
}

/**
 * Contact sync result
 */
export interface IContactSyncResult {
  status: ContactSyncStatus;
  syncId: string;
  startedAt: Date;
  completedAt?: Date;
  totalContacts: number;
  processedContacts: number;
  newContacts: number;
  updatedContacts: number;
  deletedContacts: number;
  errors: ISyncError[];
  progress: number; // 0-100
}

/**
 * Sync error interface
 */
export interface ISyncError {
  contactId?: number;
  error: string;
  timestamp: Date;
  retryCount: number;
}

/**
 * Contact change interface
 */
export interface IContactChange {
  contactId: number;
  changeType: 'created' | 'updated' | 'deleted';
  changes: Record<string, any>;
  timestamp: Date;
}
