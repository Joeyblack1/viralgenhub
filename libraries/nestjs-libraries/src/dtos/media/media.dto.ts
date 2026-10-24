import {
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
  Validate,
} from 'class-validator';
import { ValidUrlExtension, ValidUrlPath } from '@gitroom/helpers/utils/valid.url.path';

export class MediaDto {
  @IsString()
  @IsDefined()
  id: string;

  @IsString()
  @IsDefined()
  @Validate(ValidUrlPath)
  @Validate(ValidUrlExtension)
  path: string;

  @ValidateIf((o) => o.alt)
  @IsString()
  alt?: string;

  @ValidateIf((o) => o.thumbnail)
  @IsUrl()
  thumbnail?: string;

  // chosen in the composer's media settings; Instagram and TikTok read it
  // when they publish a video (thumb_offset)
  @IsOptional()
  @IsNumber()
  thumbnailTimestamp?: number;
}
