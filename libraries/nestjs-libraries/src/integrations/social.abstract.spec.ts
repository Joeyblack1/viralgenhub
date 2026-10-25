import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { localUploadPath } from './social.abstract';

describe('localUploadPath', () => {
  const env = { ...process.env };
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vgh-uploads-'));
    mkdirSync(join(root, '2026', '10', '25'), { recursive: true });
    writeFileSync(join(root, '2026', '10', '25', 'clip.mp4'), 'video');
    process.env.STORAGE_PROVIDER = 'local';
    process.env.UPLOAD_DIRECTORY = root;
    process.env.FRONTEND_URL = 'https://app.example.com';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('maps a public upload URL to the file on disk', () => {
    expect(
      localUploadPath('https://app.example.com/uploads/2026/10/25/clip.mp4')
    ).toBe(join(root, '2026', '10', '25', 'clip.mp4'));
  });

  it('ignores query strings', () => {
    expect(
      localUploadPath('https://app.example.com/uploads/2026/10/25/clip.mp4?v=1')
    ).toBe(join(root, '2026', '10', '25', 'clip.mp4'));
  });

  it('leaves other hosts, other storage and missing files alone', () => {
    expect(localUploadPath('https://cdn.other.com/uploads/2026/10/25/clip.mp4')).toBeUndefined();
    expect(localUploadPath('https://app.example.com/uploads/2026/10/25/none.mp4')).toBeUndefined();
    process.env.STORAGE_PROVIDER = 'cloudflare';
    expect(localUploadPath('https://app.example.com/uploads/2026/10/25/clip.mp4')).toBeUndefined();
  });

  it('never resolves outside the upload directory', () => {
    writeFileSync(join(root, '..', 'secret.txt'), 'x');
    expect(localUploadPath('https://app.example.com/uploads/../secret.txt')).toBeUndefined();
    expect(localUploadPath('https://app.example.com/uploads/%2e%2e/secret.txt')).toBeUndefined();
  });
});
