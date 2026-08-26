import { ConfigService } from '@nestjs/config';
import { SessionService } from './session.service';

describe('SessionService', () => {
  const config = (values: Record<string, string | undefined>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  it('issues and verifies a signed user session', () => {
    const sessions = new SessionService(config({ AUTH_SESSION_SECRET: 'test-session-secret', AUTH_SESSION_HOURS: '1' }));
    const token = sessions.issue({ userId: 'user-1', companyId: 'company-1', permissions: ['checkout'] });
    expect(sessions.verify(token)).toMatchObject({ userId: 'user-1', companyId: 'company-1', permissions: ['checkout'] });
  });

  it('rejects a modified session token', () => {
    const sessions = new SessionService(config({ AUTH_SESSION_SECRET: 'test-session-secret' }));
    const token = sessions.issue({ userId: 'user-1', companyId: 'company-1', permissions: [] });
    expect(() => sessions.verify(`${token}x`)).toThrow('Invalid session token');
  });
});
