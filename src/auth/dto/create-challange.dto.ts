import { IsNotEmpty, IsString } from 'class-validator';

export class CreateChallangeDto {
  @IsString()
  @IsNotEmpty()
  publicAddress: string;
}
