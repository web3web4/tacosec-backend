import { IsString, IsNotEmpty } from 'class-validator';

export class LinkPasswordsDto {
  @IsString()
  @IsNotEmpty()
  password1Id: string;

  @IsString()
  @IsNotEmpty()
  password2Id: string;
}
