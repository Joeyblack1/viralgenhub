import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TikTokDto } from './tiktok.dto';

const base = {
  privacy_level: 'PUBLIC_TO_EVERYONE',
  duet: false,
  stitch: false,
  comment: false,
  autoAddMusic: 'no',
  brand_content_toggle: false,
  brand_organic_toggle: false,
  content_posting_method: 'DIRECT_POST',
};
const errs = async (o: object) =>
  (await validate(plainToInstance(TikTokDto, { ...base, ...o }))).map(
    (e) => e.property
  );

describe('TikTokDto, TikTok Content Sharing Guidelines', () => {
  it('accepts a complete valid post', async () => {
    expect(await errs({})).toEqual([]);
  });
  it('has no privacy default: DIRECT_POST without one is invalid', async () => {
    expect(await errs({ privacy_level: '' })).toContain('privacy_level');
    expect(await errs({ privacy_level: undefined })).toContain('privacy_level');
  });
  it('does not need privacy for UPLOAD', async () => {
    expect(
      await errs({ privacy_level: '', content_posting_method: 'UPLOAD' })
    ).toEqual([]);
  });
  it('disclosure on with nothing ticked is invalid', async () => {
    expect(await errs({ disclose: true })).toContain('disclose');
    expect(await errs({ disclose: true, brand_organic_toggle: true })).toEqual(
      []
    );
    expect(await errs({ disclose: true, brand_content_toggle: true })).toEqual(
      []
    );
    expect(await errs({ disclose: false })).toEqual([]);
  });
  it('UPLOAD (inbox draft) is not blocked by disclosure or branded/privacy rules', async () => {
    expect(
      await errs({
        content_posting_method: 'UPLOAD',
        privacy_level: '',
        disclose: true,
      })
    ).toEqual([]);
    expect(
      await errs({
        content_posting_method: 'UPLOAD',
        privacy_level: 'SELF_ONLY',
        disclose: true,
        brand_content_toggle: true,
      })
    ).toEqual([]);
  });
  it('branded content cannot be private', async () => {
    expect(
      await errs({
        disclose: true,
        brand_content_toggle: true,
        privacy_level: 'SELF_ONLY',
      })
    ).toContain('privacy_level');
  });
  it('blocks when creator cannot post / video too long', async () => {
    expect(await errs({ creator_blocked: true })).toContain('creator_blocked');
    expect(await errs({ creator_blocked: false })).toEqual([]);
  });
});
