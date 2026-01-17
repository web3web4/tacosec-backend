import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePublicAddressChallangeDto {
  @IsString()
  @IsNotEmpty()
  publicAddress: string;
}
