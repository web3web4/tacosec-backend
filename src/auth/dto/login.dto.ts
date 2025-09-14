import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class LoginDto {
  /**
   * Public address of the wallet
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  publicAddress?: string;

  /**
   * Signature (currently not validated, but required)
   */
  @IsOptional()
  @IsString()
  signature?: string;
}
