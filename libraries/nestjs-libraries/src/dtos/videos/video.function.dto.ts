import { IsOptional, IsString } from 'class-validator';

export class VideoFunctionDto {
  @IsString()
  identifier: string;

  @IsString()
  functionName: string;

  @IsOptional()
  params: any;
}
