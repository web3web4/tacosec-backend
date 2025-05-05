import { SharedWithDto } from 'src/passwords/dto/shared-with.dto';
import { Type } from '../passwords/enums/type.enum';
export type passwordReturns = {
  key: string;
  value: string;
  description: string;
  sharedWith: SharedWithDto[];
  updatedAt: Date;
  createdAt: Date;
  type: Type;
};
