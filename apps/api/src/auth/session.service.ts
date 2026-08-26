import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type RetailosSession = {
  userId: string;
  companyId: string;
  permissions: string[];
  expiresAt: number;
};

@Injectable()
export class SessionService {
  private readonly secret: string;
  private readonly durationMs: number;

  constructor(config: ConfigService) {
    const configured = config.get<string>('AUTH_SESSION_SECRET')?.trim();
    if (process.env.NODE_ENV === 'production' && !configured) throw new Error('AUTH_SESSION_SECRET must be set in production.');
    this.secret = configured || randomBytes(32).toString('base64url');
    const hours = Number(config.get<string>('AUTH_SESSION_HOURS') || 12);
    this.durationMs = Number.isFinite(hours) && hours > 0 ? hours * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  }

  issue(input: Omit<RetailosSession, 'expiresAt'>) {
    const payload: RetailosSession = { ...input, expiresAt: Date.now() + this.durationMs };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.signature(encoded)}`;
  }

  verify(token: string): RetailosSession {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature || !this.matches(encoded, signature)) throw new UnauthorizedException('Invalid session token');
    let payload: RetailosSession;
    try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as RetailosSession; } catch { throw new UnauthorizedException('Invalid session token'); }
    if (!payload.userId || !payload.companyId || !Array.isArray(payload.permissions) || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Session token has expired');
    }
    return payload;
  }

  private signature(value: string) { return createHmac('sha256', this.secret).update(value).digest('base64url'); }
  private matches(value: string, signature: string) {
    const expected = Buffer.from(this.signature(value));
    const received = Buffer.from(signature);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
}
