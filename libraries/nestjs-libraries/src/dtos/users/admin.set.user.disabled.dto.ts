import { IsBoolean, IsDefined } from 'class-validator';

export class AdminSetUserDisabledDto {
  @IsBoolean()
  @IsDefined()
  disabled: boolean;
}
