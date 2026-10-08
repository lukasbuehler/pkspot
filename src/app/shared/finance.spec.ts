import { describe, expect, it } from 'vitest';
import { FinanceEntry, compileFinanceRates, summarizeFinances, validateFinanceEntry } from './finance';

const entry = (overrides: Partial<FinanceEntry> = {}): FinanceEntry => ({
  id: 'entry-1', date: '2026-10-01', description: 'Hosting', partner: '', kind: 'expense',
  category: 'infrastructure', status: 'settled', amount_chf_cents: 10000, notes: '', ...overrides,
});

describe('finance reporting', () => {
  it('separates pending cash, founder funding and non-cash benefits from received income', () => {
    const totals = summarizeFinances([
      entry(), entry({ kind: 'income', amount_chf_cents: 6000, category: 'reimbursement' }),
      entry({ kind: 'income', status: 'pending', amount_chf_cents: 20000 }),
      entry({ kind: 'founder', amount_chf_cents: 5000 }),
      entry({ kind: 'in_kind', amount_chf_cents: 9000 }),
      entry({ kind: 'in_kind', amount_chf_cents: null }),
      entry({ kind: 'expense', status: 'pending', amount_chf_cents: 1200 }),
    ]);
    expect(totals).toMatchObject({ income: 6000, expenses: 10000, founder: 5000, inKind: 9000,
      pendingIncome: 20000, pendingExpenses: 1200, net: 1000 });
    expect(totals.expenseCategories.find(row => row.key === 'salaries')?.cents).toBe(0);
  });

  it('rejects invalid dates, fractional cents and unknown cash amounts', () => {
    for (const data of [entry({ date: '2026-02-30' }), entry({ date: '2025-01-01' }),
      entry({ amount_chf_cents: 0.1 }), entry({ amount_chf_cents: null }), entry({ amount_chf_cents: -1 })]) {
      expect(() => validateFinanceEntry(data, 2026)).toThrow();
    }
    expect(() => validateFinanceEntry(entry({ kind: 'in_kind', amount_chf_cents: null }), 2026)).not.toThrow();
  });

  it('averages daily CHF cross-rates and excludes other years and future observations', () => {
    const csv = 'Date, USD, CHF,\n2025-12-31,1,1,\n2026-01-02,2,2,\n2026-01-05,2,1,\n2026-12-31,9,1,';
    expect(compileFinanceRates(csv, 2026, '2026-10-06')).toEqual({
      year: 2026, start: '2026-01-02', end: '2026-01-05', observations: 2,
      eur_per_chf: 0.75, usd_per_chf: 1.5, source: 'ECB',
    });
  });

  it('rejects missing, duplicate and invalid observations without saving a misleading average', () => {
    for (const csv of ['Date,EUR\n2026-01-02,1', 'Date,CHF,USD\n2025-01-02,1,1',
      'Date,CHF,USD\n2026-01-02,0,1', 'Date,CHF,USD\n2026-01-02,1,1\n2026-01-02,1,1']) {
      expect(() => compileFinanceRates(csv, 2026, '2026-10-06')).toThrow();
    }
  });
});
