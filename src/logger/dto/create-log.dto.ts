import { IsNotEmpty } from 'class-validator';

export class CreateLogDto {
  @IsNotEmpty()
  logData: any; // Accept any JSON structure without strict validation
}