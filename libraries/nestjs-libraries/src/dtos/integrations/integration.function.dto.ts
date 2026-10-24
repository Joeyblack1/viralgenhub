import { IsDefined, IsOptional, IsString } from 'class-validator';

export class IntegrationFunctionDto {
  @IsString()
  @IsDefined()
  name: string;

  @IsString()
  @IsDefined()
  id: string;

  @IsOptional()
  data: any;
}
