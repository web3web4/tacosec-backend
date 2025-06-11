import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for a single wallet entry with public key and optional secret
 */
export class WalletEntryDto {
  /**
   * Public key of the wallet
   */
  @IsString()
  @IsNotEmpty()
  'public-key': string;

  /**
   * Secret or private key (will be encrypted)
   */
  @IsString()
  @IsOptional()
  secret?: string;
}

/**
 * DTO for creating public addresses
 */
export class CreatePublicAddressDto {
  /**
   * Public key of the wallet
   */
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  /**
   * Secret or private key (optional, will be encrypted if provided)
   */
  @IsString()
  @IsOptional()
  secret?: string;

  /**
   * Telegram init data string (populated from headers)
   * @internal
   */
  telegramInitData?: string;
}

/**
 * Legacy DTO for creating multiple public addresses at once
 * @deprecated Use CreatePublicAddressDto instead which accepts a single address
 */
export class CreateMultiplePublicAddressesDto {
  /**
   * Array of wallet entries with public keys and secrets
   */
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => WalletEntryDto)
  publicAddresses: WalletEntryDto[];

  /**
   * Telegram init data string (populated from headers)
   * @internal
   */
  telegramInitData?: string;
}
