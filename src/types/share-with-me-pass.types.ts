export type SharedPassword = {
  id: string;
  key: string;
  value: string;
  description: string;
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
