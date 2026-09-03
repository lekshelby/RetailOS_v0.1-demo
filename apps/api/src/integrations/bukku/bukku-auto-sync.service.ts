import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BukkuHttpClient } from './bukku-http.client';
import { BukkuSyncService } from './bukku-sync.service';

@Injectable()
export class BukkuAutoSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BukkuAutoSyncService.name);
  private timer?: NodeJS.Timeout;
  private readonly running = new Set<string>();
  constructor(private readonly db: PrismaService, private readonly client: BukkuHttpClient, private readonly sync: BukkuSyncService) {}

  onModuleInit() {
    if (process.env.BUKKU_AUTO_SYNC_ENABLED === 'false') return;
    void this.syncOpenShifts();
    this.timer = setInterval(() => { void this.syncOpenShifts(); }, 30 * 60 * 1000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async syncNow(companyId: string, actorId: string, trigger: 'MANUAL' | 'SHIFT_OPEN' | 'SCHEDULED' = 'MANUAL') {
    const actor = await this.db.user.findFirst({ where: { id: actorId, companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.some((permission) => ['company.manage', 'backoffice.view'].includes(String(permission)))) throw new ForbiddenException('Manager access is required for Bukku reconciliation');
    return this.run(companyId, trigger, actorId);
  }

  async syncForOpenedShift(companyId: string, actorId: string) { return this.run(companyId, 'SHIFT_OPEN', actorId); }

  private async syncOpenShifts() {
    let shifts: Array<{ cashierId: string; location: { companyId: string } }>;
    try {
      shifts = await this.db.shift.findMany({ where: { closedAt: null }, select: { cashierId: true, location: { select: { companyId: true } } } });
    } catch (error) {
      this.logger.error(`Scheduled Bukku sync could not load open shifts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return;
    }

    for (const shift of shifts) {
      try {
        await this.run(shift.location.companyId, 'SCHEDULED', shift.cashierId);
      } catch (error) {
        // Scheduled integration failures are recorded by run() and retried at
        // the next interval. They must never terminate the RetailOS process.
        this.logger.warn(`Scheduled Bukku sync failed for company ${shift.location.companyId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async run(companyId: string, trigger: 'MANUAL' | 'SHIFT_OPEN' | 'SCHEDULED', actorId?: string) {
    if (!this.client.isConfigured()) return { skipped: true, reason: 'Bukku is not configured' };
    if (this.running.has(companyId)) return { skipped: true, reason: 'A Bukku sync is already running' };
    this.running.add(companyId);
    try {
      const products = await this.sync.importProducts(companyId);
      const contacts = await this.sync.importContacts(companyId);
      await this.db.auditLog.create({ data: { companyId, actorId, action: 'BUKKU_SYNC_COMPLETED', entityType: 'BukkuSync', after: { trigger, products, contacts } } });
      return { skipped: false, trigger, products, contacts };
    } catch (error) {
      await this.db.auditLog.create({ data: { companyId, actorId, action: 'BUKKU_SYNC_FAILED', entityType: 'BukkuSync', after: { trigger, message: error instanceof Error ? error.message : 'Unknown error' } } });
      throw error;
    } finally { this.running.delete(companyId); }
  }
}
