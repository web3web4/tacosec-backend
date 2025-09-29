export type SharedPassword = {
  id: string;
  key: string;
  value: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  sharedWith?: any[];
  reports?: any[];
};

export type SharedByUser = {
  userId: string;
  username: string;
  telegramId: string | null;
  latestPublicAddress: string | null;
};

export type OwnerPasswords = {
  username?: string; // Keep for backward compatibility
  sharedBy?: SharedByUser; // New structure with complete user info
  passwords: SharedPassword[];
  count: number;
};

export type SharedWithMeResponse = {
  sharedWithMe: OwnerPasswords[];
  userCount: number;
};
