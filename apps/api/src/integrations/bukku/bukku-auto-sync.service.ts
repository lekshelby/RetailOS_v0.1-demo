import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BukkuHttpClient } from './bukku-http.client';
import { BukkuSyncService } from './bukku-sync.service';

@Injectable()
export class BukkuAutoSyncService implements OnModuleInit, OnModuleDestroy {
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
    const actor = await this.db.user.findFirst({ where: { id: actorId, companyId, status: 'ACTIVE' } });
    if (!actor) throw new Error('Active RetailOS user not found');
    return this.run(companyId, trigger, actorId);
  }

  async syncForOpenedShift(companyId: string, actorId: string) { return this.run(companyId, 'SHIFT_OPEN', actorId); }

  private async syncOpenShifts() {
    const shifts = await this.db.shift.findMany({ where: { closedAt: null }, select: { cashierId: true, location: { select: { companyId: true } } } });
    for (const shift of shifts) void this.run(shift.location.companyId, 'SCHEDULED', shift.cashierId);
  }

  private async run(companyId: string, trigger: 'MANUAL' | 'SHIFT_OPEN' | 'SCHEDULED', actorId?: string) {
    if (!this.client.isConfigured()) return { skipped: true, reason: 'Bukku is not configured' };
    if (this.running.has(companyId)) return { skipped: true, reason: 'A Bukku sync is already running' };
    this.running.add(companyId);
    try {
      const products = await this.sync.importProducts(companyId);
      await this.db.auditLog.create({ data: { companyId, actorId, action: 'BUKKU_SYNC_COMPLETED', entityType: 'BukkuSync', after: { trigger, products } } });
      return { skipped: false, trigger, products };
    } catch (error) {
      await this.db.auditLog.create({ data: { companyId, actorId, action: 'BUKKU_SYNC_FAILED', entityType: 'BukkuSync', after: { trigger, message: error instanceof Error ? error.message : 'Unknown error' } } });
      throw error;
    } finally { this.running.delete(companyId); }
  }
}
