import { IsIn, IsOptional, IsString } from 'class-validator';

export class BillingSubscribeDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  period: 'MONTHLY' | 'YEARLY';

  @IsIn(['STANDARD', 'PRO', 'TEAM', 'ULTIMATE'])
  billing: 'STANDARD' | 'PRO' | 'TEAM' | 'ULTIMATE';

  @IsString()
  @IsOptional()
  utm: string;

  @IsString()
  @IsOptional()
  dub: string;

  @IsString()
  @IsOptional()
  datafast_session_id: string;

  @IsString()
  @IsOptional()
  datafast_visitor_id: string;
}
