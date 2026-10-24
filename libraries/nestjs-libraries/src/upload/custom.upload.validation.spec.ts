// file-type is ESM-only; these specs only need the size arithmetic
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }), {
  virtual: true,
});

import {
  MAX_MULTIPART_PARTS,
  getMaxSize,
  isValidPartNumber,
  isWithinMaxSize,
} from './custom.upload.validation';

describe('upload size caps (multipart R2 uploads)', () => {
  it('images are capped at 30 MB and videos at 1 GB', () => {
    expect(getMaxSize('image/png')).toBe(30 * 1024 * 1024);
    expect(getMaxSize('video/mp4')).toBe(1024 * 1024 * 1024);
    expect(() => getMaxSize('application/pdf')).toThrow();
  });

  it('a declared size at the cap passes, one byte over fails', () => {
    expect(isWithinMaxSize('image/jpeg', 30 * 1024 * 1024)).toBe(true);
    expect(isWithinMaxSize('image/jpeg', 30 * 1024 * 1024 + 1)).toBe(false);
    expect(isWithinMaxSize('video/mp4', 1024 * 1024 * 1024)).toBe(true);
    expect(isWithinMaxSize('video/mp4', 1024 * 1024 * 1024 + 1)).toBe(false);
    expect(isWithinMaxSize('video/quicktime', 500 * 1024 * 1024)).toBe(true);
  });

  it('a missing, negative or non-numeric size is never waved through', () => {
    expect(isWithinMaxSize('image/png', undefined)).toBe(false);
    expect(isWithinMaxSize('image/png', null)).toBe(false);
    expect(isWithinMaxSize('image/png', -1)).toBe(false);
    expect(isWithinMaxSize('image/png', NaN)).toBe(false);
    expect(isWithinMaxSize('image/png', Infinity)).toBe(false);
    expect(isWithinMaxSize('image/png', 'big')).toBe(false);
    expect(isWithinMaxSize('image/png', {})).toBe(false);
  });

  it('a numeric string (Content-Length style) is accepted', () => {
    expect(isWithinMaxSize('image/png', '1024')).toBe(true);
  });

  it('an unsupported type is rejected rather than thrown', () => {
    expect(isWithinMaxSize('application/zip', 10)).toBe(false);
  });

  it('part numbers are integers from 1 to the cap', () => {
    expect(isValidPartNumber(1)).toBe(true);
    expect(isValidPartNumber(MAX_MULTIPART_PARTS)).toBe(true);
    expect(isValidPartNumber(MAX_MULTIPART_PARTS + 1)).toBe(false);
    expect(isValidPartNumber(0)).toBe(false);
    expect(isValidPartNumber(-3)).toBe(false);
    expect(isValidPartNumber(1.5)).toBe(false);
    expect(isValidPartNumber(NaN)).toBe(false);
    expect(isValidPartNumber('7')).toBe(true);
    expect(isValidPartNumber('abc')).toBe(false);
    expect(isValidPartNumber(undefined)).toBe(false);
  });

  it('the part cap covers a 1 GB video in 5 MiB parts', () => {
    expect(MAX_MULTIPART_PARTS).toBeGreaterThanOrEqual(
      Math.ceil((1024 * 1024 * 1024) / (5 * 1024 * 1024))
    );
  });
});
