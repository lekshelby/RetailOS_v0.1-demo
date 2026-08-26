import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { RetailosSession, SessionService } from './session.service';

type SessionRequest = { method: string; path: string; originalUrl?: string; query: Record<string, unknown>; body?: unknown; header(name: string): string | undefined; retailosSession?: RetailosSession };
type SessionResponse = { status(code: number): { json(value: unknown): void } };

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly sessions: SessionService) {}

  use(request: SessionRequest, response: SessionResponse, next: () => void) {
    if (this.isPublic(request)) return next();
    try {
      const session = this.sessions.verify(this.bearer(request));
      this.requireMatchingIdentity(request, session);
      request.retailosSession = session;
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication required';
      response.status(error instanceof UnauthorizedException ? 401 : 403).json({ statusCode: error instanceof UnauthorizedException ? 401 : 403, message });
    }
  }

  private isPublic(request: SessionRequest) {
    if (request.method === 'OPTIONS') return true;
    const paths = [request.originalUrl, request.path].filter((value): value is string => Boolean(value)).map((value) => value.split('?')[0].replace(/^\/api(?=\/|$)/, ''));
    return paths.some((path) =>
      (request.method === 'GET' && (path === '/health' || path === '/pos/bootstrap')) ||
      (request.method === 'POST' && path === '/auth/pin') || path.startsWith('/e-invoice/request/'),
    );
  }

  private bearer(request: SessionRequest) {
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('A signed session token is required');
    return header.slice('Bearer '.length).trim();
  }

  private requireMatchingIdentity(request: SessionRequest, session: RetailosSession) {
    const input = { ...(request.query as Record<string, unknown>), ...((request.body || {}) as Record<string, unknown>) };
    if (typeof input.companyId === 'string' && input.companyId !== session.companyId) throw new Error('Session does not belong to this company');
    for (const key of ['actorId', 'cashierId']) {
      if (typeof input[key] === 'string' && input[key] !== session.userId) throw new Error(`Session does not match ${key}`);
    }
    const managerId = input.managerId;
    if (typeof managerId === 'string' && managerId !== session.userId) {
      const approvals = this.approvalSessions(request);
      if (!approvals.some((approval) => approval.companyId === session.companyId && approval.userId === managerId)) throw new Error('Manager approval does not match this request');
    }
    for (const approvedById of this.approvers(input)) {
      if (approvedById === session.userId) continue;
      const approvals = this.approvalSessions(request);
      if (!approvals.some((approval) => approval.companyId === session.companyId && approval.userId === approvedById && approval.permissions.includes('discount.approve'))) {
        throw new Error('A valid manager approval is required for this discount');
      }
    }
  }

  private approvalSessions(request: SessionRequest): RetailosSession[] {
    const value = request.header('x-retailos-approval');
    if (!value) throw new UnauthorizedException('A manager approval session is required');
    return value.split(',').map((token: string) => this.sessions.verify(token.trim()));
  }

  private approvers(value: unknown): string[] {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return value.flatMap((item) => this.approvers(item));
    const record = value as Record<string, unknown>;
    return [typeof record.approvedById === 'string' ? record.approvedById : undefined, ...Object.values(record).flatMap((item) => this.approvers(item))].filter((id): id is string => Boolean(id));
  }
}
