import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

export function isBlockedIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);

  if ([a, b].some((n) => Number.isNaN(n))) return true;

  return (
    a === 0 ||                       // 0.0.0.0/8
    a === 10 ||                      // 10.0.0.0/8
    a === 127 ||                     // 127.0.0.0/8
    (a === 169 && b === 254) ||      // 169.254.0.0/16
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) ||      // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15
    a >= 224                         // multicast/reserved
  );
}

// The eight 16-bit groups of an IPv6 literal, whichever way it is written
// ("::", a dotted IPv4 tail, a zone id), or null when it is not one. Every
// IPv6 check below runs on the groups, so a spelling can't dodge a prefix
// test: `::ffff:7f00:1` and `::ffff:127.0.0.1` are the same address.
function ipv6Groups(ip: string): number[] | null {
  if (net.isIP(ip) !== 6) {
    return null;
  }

  let normalized = ip.toLowerCase().split('%')[0];

  const dotted = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number);
    normalized =
      normalized.slice(0, -dotted[1].length) +
      ((a << 8) | b).toString(16) +
      ':' +
      ((c << 8) | d).toString(16);
  }

  const [head, tail] = normalized.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const fill =
    tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length;
  const groups = [
    ...headGroups,
    ...Array(Math.max(fill, 0)).fill('0'),
    ...tailGroups,
  ].map((group) => parseInt(group, 16));

  if (groups.length !== 8 || groups.some((group) => Number.isNaN(group))) {
    return null;
  }
  return groups;
}

// IPv4-mapped (::ffff:a.b.c.d, also written ::ffff:7f00:1) and NAT64
// (64:ff9b::a.b.c.d) addresses reach an IPv4 host, so they are judged as
// that dotted IPv4. Null for any other IPv6 address.
export function embeddedIPv4(ip: string): string | null {
  const groups = ipv6Groups(ip);
  if (!groups) {
    return null;
  }

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const mapped =
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff;
  const nat64 =
    g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;
  if (!mapped && !nat64) {
    return null;
  }

  return [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff].join('.');
}

export function isBlockedIPv6(ip: string): boolean {
  const groups = ipv6Groups(ip);
  if (!groups) {
    return true;
  }

  const [first] = groups;
  return (
    groups.slice(0, 6).every((group) => group === 0) || // ::/96: unspecified, ::1 loopback, IPv4-compatible
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xff00) === 0xff00    // multicast ff00::/8
  );
}

export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isBlockedIPv4(ip);
  }
  if (version === 6) {
    const mapped = embeddedIPv4(ip);
    if (mapped) {
      return isBlockedIPv4(mapped);
    }
    return isBlockedIPv6(ip);
  }
  return true;
}

export async function isSafePublicHttpsUrl(value: unknown): Promise<boolean> {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }

  if (!parsed.hostname) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (hostname === 'localhost') {
    return false;
  }

  // If user supplied a literal IP directly, validate it immediately
  const literalIpVersion = net.isIP(hostname);
  if (literalIpVersion) {
    return !isBlockedIp(hostname);
  }

  try {
    const records = await dns.lookup(hostname, { all: true });

    if (!records.length) {
      return false;
    }

    for (const record of records) {
      if (isBlockedIp(record.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

@ValidatorConstraint({ name: 'IsSafeWebhookUrl', async: true })
export class IsSafeWebhookUrlConstraint implements ValidatorConstraintInterface {
  async validate(value: unknown, _args: ValidationArguments): Promise<boolean> {
    return isSafePublicHttpsUrl(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'URL must be a public HTTPS URL and must not resolve to localhost, private, loopback, or link-local addresses';
  }
}

export function IsSafeWebhookUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsSafeWebhookUrlConstraint,
    });
  };
}