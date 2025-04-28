import { Type } from '../users/enums/type.enum';
export type passwordReturns = {
  key: string;
  value: string;
  description: string;
  sharedWith: string[];
  updatedAt: Date;
  createdAt: Date;
  type: Type;
};
