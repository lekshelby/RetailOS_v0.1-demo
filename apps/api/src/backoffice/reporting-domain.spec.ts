import { combineCostState, lineCost, resolveDateRange } from './reporting-domain';

describe('Back Office reporting domain', () => {
  it('resolves Malaysia today, week, month and inclusive custom dates', () => {
    const now = new Date('2026-09-02T03:00:00Z');
    expect(resolveDateRange({ range: 'TODAY' }, now).fromDate).toBe('2026-09-01T16:00:00.000Z');
    expect(resolveDateRange({ range: 'WEEK' }, now).fromDate).toBe('2026-08-30T16:00:00.000Z');
    expect(resolveDateRange({ range: 'MONTH' }, now).fromDate).toBe('2026-08-31T16:00:00.000Z');
    expect(resolveDateRange({ range: 'CUSTOM', from: '2026-08-01', to: '2026-08-31' }, now).toDate).toBe('2026-08-31T15:59:59.999Z');
  });

  it('marks legacy cost as provisional and missing cost as unvalued', () => {
    expect(lineCost({ baseQuantity: 2, fallbackUnitCost: 3.25 })).toEqual({ cents: 650, unitCost: 3.25, status: 'PROVISIONAL' });
    expect(lineCost({ baseQuantity: 2 })).toEqual({ cents: 0, unitCost: null, status: 'UNVALUED' });
    expect(lineCost({ persistedCogs: 5, persistedUnitCost: 2.5, persistedStatus: 'FINAL', baseQuantity: 2, negativeStock: true }).status).toBe('PROVISIONAL');
    expect(combineCostState('FINAL', 'UNVALUED')).toBe('UNVALUED');
  });
});
