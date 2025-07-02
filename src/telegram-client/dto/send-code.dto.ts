import { IsNumber, IsPhoneNumber, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO for sending authentication code
 */
export class SendCodeDto {
  @IsPhoneNumber(null, { message: 'Invalid phone number format' })
  @IsNotEmpty({ message: 'Phone number is required' })
  phoneNumber: string;

  @IsNumber({}, { message: 'User ID must be a number' })
  @Transform(({ value }) => parseInt(value))
  userId: number;
}

/**
 * Response DTO for send code operation
 */
export class SendCodeResponseDto {
  success: boolean;
  phoneCodeHash: string;
  timeout?: number;
  type?: string;
  message: string;
}
