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
   * Signature over the latest challange generated for this publicAddress
   */
  @IsOptional()
  @IsString()
  signature?: string;
}
