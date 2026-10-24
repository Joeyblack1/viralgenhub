import { isBlockedIp } from './webhook.url.validator';
import {
  getSsrfSafeAxios,
  ssrfSafeDispatcher,
} from './ssrf.safe.dispatcher';

// Every address here is refused before a socket opens, so nothing is
// contacted and a hang means the literal check was skipped.
const blockedUrls = [
  'http://127.0.0.1:8080/',
  'http://[::ffff:7f00:1]:8080/',
  'http://169.254.169.254/latest/meta-data/',
  'http://10.0.0.1/',
];

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '0:0:0:0:0:ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::10.0.0.1',
    'fe80::1',
    'fd00::1',
    'ff02::1',
    '::127.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '::ffff:8.8.8.8', '::ffff:808:808', '2606:4700::1111'])(
    'allows %s',
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    }
  );

  it('blocks what is not an address at all', () => {
    expect(isBlockedIp('')).toBe(true);
    expect(isBlockedIp('localhost')).toBe(true);
  });
});

describe('ssrfSafeDispatcher, IP-literal hosts', () => {
  it.each(blockedUrls)('refuses fetch of %s before connecting', async (url) => {
    await expect(
      fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(3000),
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      })
    ).rejects.toMatchObject({ cause: { message: 'Blocked IP' } });
  }, 5000);

  it.each(blockedUrls)('refuses axios get of %s before connecting', async (url) => {
    await expect(
      getSsrfSafeAxios().get(url, { signal: AbortSignal.timeout(3000) })
    ).rejects.toThrow('Blocked IP');
  }, 5000);
});
