import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { verifyPin } from './pin';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService, private readonly sessions: SessionService) {}
  async loginWithPin(companyId: string, pin: string) {
    const users = await this.db.user.findMany({ where: { companyId, status: 'ACTIVE', pinHash: { not: null } }, include: { role: true } });
    const user = users.find((candidate) => candidate.pinHash && verifyPin(pin, candidate.pinHash));
    if (!user) throw new UnauthorizedException('Invalid PIN');
    await this.db.auditLog.create({ data: { companyId, actorId: user.id, action: 'PIN_LOGIN', entityType: 'User', entityId: user.id } });
    const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((permission): permission is string => typeof permission === 'string') : [];
    const sessionToken = this.sessions.issue({ userId: user.id, companyId, permissions });
    return { sessionToken, user: { id: user.id, name: user.name, role: user.role.name, permissions: user.role.permissions } };
  }
}
