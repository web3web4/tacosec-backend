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

export type OwnerPasswords = {
  username: string;
  passwords: SharedPassword[];
  count: number;
};

export type SharedWithMeResponse = {
  sharedWithMe: OwnerPasswords[];
  userCount: number;
};
