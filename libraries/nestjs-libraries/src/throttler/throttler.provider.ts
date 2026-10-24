import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

const isPublicComment = (method: string, url: string) =>
  method === 'POST' && /^\/public\/posts\/[^/]+\/comments/.test(url);

// The client controls the FIRST X-Forwarded-For entry, so never key a limit
// on it. nginx overwrites the header with the single address it saw and
// express runs with `trust proxy` = 1, so req.ip is that address; the LAST
// entry is the fallback when express has no opinion. CF-Connecting-IP is only
// honoured when the deployment says it sits behind Cloudflare, otherwise any
// client could send it and pick its own bucket.
export const getClientIp = (req: Record<string, any>): string => {
  const cloudflare = String(req.headers?.['cf-connecting-ip'] || '').trim();
  if (process.env.TRUST_CF_CONNECTING_IP && cloudflare) {
    return cloudflare;
  }

  if (req.ip) {
    return req.ip;
  }

  const forwarded = String(req.headers?.['x-forwarded-for'] || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  return forwarded[forwarded.length - 1] || req.socket?.remoteAddress || '';
};

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const { url, method } = context.switchToHttp().getRequest<Request>();
    if (
      (method === 'POST' && url.includes('/public/v1/posts')) ||
      isPublicComment(method, url)
    ) {
      return super.canActivate(context);
    }

    return true;
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    if (!req.org) {
      return 'ip_' + (getClientIp(req) || 'unknown');
    }

    return (
      req.org.id + '_' + (req.url.indexOf('/posts') > -1 ? 'posts' : 'other')
    );
  }
}

// route-level guard for public endpoints, keyed by the client address the
// proxy forwards rather than the org the global guard expects
@Injectable()
export class ThrottlerRealIpGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    return getClientIp(req) || 'unknown';
  }
}
