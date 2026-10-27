import { IsString, Matches } from 'class-validator';
import { WHATS_NEW_ID_PATTERN } from '@gitroom/helpers/utils/whats.new';

export class WhatsNewSeenDto {
  @IsString()
  @Matches(WHATS_NEW_ID_PATTERN)
  id: string;
}
