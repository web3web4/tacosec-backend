import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  /**
   * Refresh token to be used for generating new access token
   */
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
