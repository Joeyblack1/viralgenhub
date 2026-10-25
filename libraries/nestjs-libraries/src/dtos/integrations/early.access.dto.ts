import {
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class EarlyAccessRequestDto {
  @IsString()
  @IsDefined()
  @MaxLength(100)
  provider: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  note?: string;

  @IsBoolean()
  @IsOptional()
  newsletter?: boolean;
}
