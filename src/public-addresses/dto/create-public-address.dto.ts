import { IsArray, IsNotEmpty } from 'class-validator';

export class CreatePublicAddressDto {
  /**
   * Array of public wallet addresses to add
   */
  @IsArray()
  @IsNotEmpty()
  publicAddresses: string[];

  /**
   * Telegram init data string (populated from headers)
   * @internal
   */
  telegramInitData?: string;
}
