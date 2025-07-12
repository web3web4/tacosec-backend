import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  /**
   * Public address of the wallet
   */
  @IsString()
  @IsNotEmpty()
  publicAddress: string;

  /**
   * Signature (currently not validated, but required)
   */
  @IsString()
  signature: string;
}
