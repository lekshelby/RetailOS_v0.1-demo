export type CostState = 'FINAL' | 'PROVISIONAL' | 'UNVALUED';

export const moneyCents = (value: number | string | { toString(): string } | null | undefined) =>
  Math.round(Number(value ?? 0) * 100);

export const centsMoney = (value: number) => Math.round(value) / 100;

export function combineCostState(current: CostState, next: CostState): CostState {
  if (current === 'UNVALUED' || next === 'UNVALUED') return 'UNVALUED';
  if (current === 'PROVISIONAL' || next === 'PROVISIONAL') return 'PROVISIONAL';
  return 'FINAL';
}

export function resolveDateRange(input: { range?: string; from?: string; to?: string }, now = new Date()) {
  const malaysiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const today = new Date(`${malaysiaDate}T00:00:00+08:00`);
  const range = input.range || 'TODAY';
  let from = today;
  let to = new Date(today.getTime() + 86_400_000);
  if (range === 'WEEK') {
    const malaysiaWeekday = new Date(`${malaysiaDate}T12:00:00Z`).getUTCDay();
    const day = (malaysiaWeekday + 6) % 7;
    from = new Date(today.getTime() - day * 86_400_000);
  } else if (range === 'MONTH') {
    const [year, month] = malaysiaDate.split('-').map(Number);
    from = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`);
  } else if (range === 'CUSTOM') {
    if (!input.from || !input.to) throw new Error('Custom range requires both from and to dates');
    from = new Date(`${input.from.slice(0, 10)}T00:00:00+08:00`);
    to = new Date(new Date(`${input.to.slice(0, 10)}T00:00:00+08:00`).getTime() + 86_400_000);
  }
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw new Error('Invalid reporting date range');
  return { range, from, to, fromDate: from.toISOString(), toDate: new Date(to.getTime() - 1).toISOString() };
}

export function lineCost(input: { persistedCogs?: unknown; persistedUnitCost?: unknown; persistedStatus?: CostState; baseQuantity: unknown; fallbackUnitCost?: unknown; negativeStock?: boolean }) {
  if (input.persistedCogs != null && Number.isFinite(Number(input.persistedCogs))) {
    return { cents: moneyCents(input.persistedCogs as never), unitCost: Number(input.persistedUnitCost ?? 0), status: input.negativeStock ? 'PROVISIONAL' as const : input.persistedStatus || 'FINAL' as const };
  }
  if (input.fallbackUnitCost != null && Number.isFinite(Number(input.fallbackUnitCost))) {
    const cents = Math.round(Number(input.baseQuantity) * Number(input.fallbackUnitCost) * 100);
    return { cents, unitCost: Number(input.fallbackUnitCost), status: 'PROVISIONAL' as const };
  }
  return { cents: 0, unitCost: null, status: 'UNVALUED' as const };
}
