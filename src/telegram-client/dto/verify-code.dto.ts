import {
  IsString,
  IsNumber,
  IsPhoneNumber,
  IsNotEmpty,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO for verifying authentication code
 */
export class VerifyCodeDto {
  @IsString({ message: 'Code must be a string' })
  @IsNotEmpty({ message: 'Code is required' })
  @Length(4, 6, { message: 'Code must be between 4 and 6 characters' })
  code: string;

  @IsPhoneNumber(null, { message: 'Invalid phone number format' })
  @IsNotEmpty({ message: 'Phone number is required' })
  phoneNumber: string;

  @IsString({ message: 'Phone code hash must be a string' })
  @IsNotEmpty({ message: 'Phone code hash is required' })
  phoneCodeHash: string;

  @IsNumber({}, { message: 'User ID must be a number' })
  @Transform(({ value }) => parseInt(value))
  userId: number;
}

/**
 * Response DTO for verify code operation
 */
export class VerifyCodeResponseDto {
  success: boolean;
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
  };
  sessionString: string;
  message: string;
}

/**
 * DTO for authentication status
 */
export class AuthStatusDto {
  isAuthenticated: boolean;
  hasActiveAuthSession: boolean;
  sessionExists: boolean;
}

/**
 * DTO for logout response
 */
export class LogoutResponseDto {
  success: boolean;
  message: string;
}
