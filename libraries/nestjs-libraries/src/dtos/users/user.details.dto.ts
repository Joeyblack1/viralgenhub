import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UserDetailDto {
  @IsString()
  @MinLength(3)
  fullname: string;

  @IsString()
  @IsOptional()
  bio: string;

  // the media-library record as the frontend holds it; only its id is read,
  // so it is kept whole (whitelist would empty a nested object) and not
  // validated as a MediaDto, which would refuse avif/bmp/tiff avatars
  @IsOptional()
  @IsObject()
  picture: MediaDto;
}
