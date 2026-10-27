import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { YoutubeSettingsDto } from './youtube.settings.dto';

const base = {
  title: 'A title',
  type: 'public',
  selfDeclaredMadeForKids: 'no',
};
const errs = async (o: object) =>
  (await validate(plainToInstance(YoutubeSettingsDto, { ...base, ...o }))).map(
    (e) => e.property
  );

describe('YoutubeSettingsDto, altered or synthetic content', () => {
  it('is optional, so posts made before the setting existed stay valid', async () => {
    expect(await errs({})).toEqual([]);
  });
  it('accepts true and false', async () => {
    expect(await errs({ containsSyntheticMedia: true })).toEqual([]);
    expect(await errs({ containsSyntheticMedia: false })).toEqual([]);
  });
  it('rejects a value that is not a boolean', async () => {
    expect(await errs({ containsSyntheticMedia: 'yes' })).toContain(
      'containsSyntheticMedia'
    );
  });
});
