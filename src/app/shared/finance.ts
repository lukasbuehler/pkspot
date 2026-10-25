export const FINANCE_CATEGORIES = {
  infrastructure: 'Infrastructure',
  distribution: 'Distribution & tools',
  administration: 'Domains & administration',
  marketing: 'Marketing',
  merchandise: 'Merchandise',
  salaries: 'Salaries',
  community: 'Community contributions',
  partnership: 'Partnerships',
  reimbursement: 'Reimbursements',
  sales: 'Sales',
  founder: 'Founder funding',
} as const;

export type FinanceCategory = keyof typeof FINANCE_CATEGORIES;
export type FinanceKind = 'income' | 'expense' | 'founder' | 'in_kind';
export type FinanceStatus = 'pending' | 'settled';
export type DisplayCurrency = 'CHF' | 'EUR' | 'USD';

export interface FinanceEntry {
  id: string;
  date: string;
  description: string;
  partner: string;
  kind: FinanceKind;
  category: FinanceCategory;
  status: FinanceStatus;
  // Integer CHF cents are canonical. An unknown in-kind value is not zero.
  amount_chf_cents: number | null;
  notes: string;
}

export interface FinanceRates {
  year: number;
  start: string;
  end: string;
  observations: number;
  eur_per_chf: number;
  usd_per_chf: number;
  source: 'ECB';
}

export interface FinanceYear {
  notes: string;
  rates: FinanceRates | null;
}

export interface FinanceLedger {
  entries: FinanceEntry[];
  settings: FinanceYear;
}

export function validFinanceDate(value: string, year: number): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value.startsWith(`${year}-`) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateFinanceEntry(entry: FinanceEntry, year: number): void {
  const amount = entry.amount_chf_cents;
  if (!Number.isInteger(year) || year < 2020 || year > 2100 ||
      !/^[\w-]{1,80}$/.test(entry.id) || !validFinanceDate(entry.date, year) ||
      !entry.description.trim() || entry.description.length > 200 ||
      entry.partner.length > 120 || entry.notes.length > 3000 ||
      !['income', 'expense', 'founder', 'in_kind'].includes(entry.kind) ||
      !['pending', 'settled'].includes(entry.status) ||
      !Object.hasOwn(FINANCE_CATEGORIES, entry.category) ||
      !(amount === null && entry.kind === 'in_kind' ||
        typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 && amount <= 1e11)) {
    throw new Error('Check the entry date, description and CHF amount. Only non-cash entries may have an unknown value.');
  }
}

export function summarizeFinances(entries: readonly FinanceEntry[]) {
  const totals = { income: 0, expenses: 0, founder: 0, inKind: 0, pendingIncome: 0, pendingExpenses: 0 };
  const expenses = new Map<FinanceCategory, number>();
  for (const entry of entries) {
    const amount = entry.amount_chf_cents ?? 0;
    if (entry.status === 'pending') {
      if (entry.kind === 'income') totals.pendingIncome += amount;
      if (entry.kind === 'expense') totals.pendingExpenses += amount;
      continue;
    }
    if (entry.kind === 'income') totals.income += amount;
    if (entry.kind === 'founder') totals.founder += amount;
    if (entry.kind === 'in_kind') totals.inKind += amount;
    if (entry.kind === 'expense') {
      totals.expenses += amount;
      expenses.set(entry.category, (expenses.get(entry.category) ?? 0) + amount);
    }
  }
  return {
    ...totals,
    net: totals.income + totals.founder - totals.expenses,
    expenseCategories: Object.entries(FINANCE_CATEGORIES)
      .filter(([key]) => expenses.has(key as FinanceCategory) || key === 'salaries')
      .map(([key, label]) => ({ key, label, cents: expenses.get(key as FinanceCategory) ?? 0 }))
      .sort((a, b) => b.cents - a.cents),
  };
}

/** ECB CSV quotes currencies per EUR. Average each daily CHF cross-rate,
 * rather than inverting an average (which gives a different result).
 * Only published observations in the reporting year through the cutoff count.
 */
export function compileFinanceRates(csv: string, year: number, cutoff: string): FinanceRates {
  const rows = csv.trim().split(/\r?\n/).map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
  const header = rows.shift() ?? [];
  const dateIndex = header.indexOf('Date');
  const chfIndex = header.indexOf('CHF');
  const usdIndex = header.indexOf('USD');
  if ([dateIndex, chfIndex, usdIndex].some(index => index < 0)) {
    throw new Error('Use the ECB historical CSV with Date, CHF and USD columns.');
  }
  const observations = new Map<string, { eur: number; usd: number }>();
  for (const row of rows) {
    const date = row[dateIndex];
    if (!date?.startsWith(`${year}-`) || date > cutoff) continue;
    const chf = Number(row[chfIndex]);
    const usd = Number(row[usdIndex]);
    if (!validFinanceDate(date, year) || !Number.isFinite(chf) || chf <= 0 ||
        !Number.isFinite(usd) || usd <= 0 || observations.has(date)) {
      throw new Error('The selected year contains invalid or duplicate exchange-rate observations.');
    }
    observations.set(date, { eur: 1 / chf, usd: usd / chf });
  }
  const dates = [...observations.keys()].sort();
  if (!dates.length) throw new Error('No exchange-rate observations were found for this year through today.');
  const sum = [...observations.values()].reduce((a, b) => ({ eur: a.eur + b.eur, usd: a.usd + b.usd }), { eur: 0, usd: 0 });
  return { year, start: dates[0], end: dates[dates.length - 1], observations: dates.length,
    eur_per_chf: sum.eur / dates.length, usd_per_chf: sum.usd / dates.length, source: 'ECB' };
}

export function validateFinanceRates(rates: FinanceRates, year: number): void {
  if (rates.year !== year || rates.source !== 'ECB' || !validFinanceDate(rates.start, year) ||
      !validFinanceDate(rates.end, year) || rates.start > rates.end ||
      !Number.isInteger(rates.observations) || rates.observations < 1 || rates.observations > 366 ||
      ![rates.eur_per_chf, rates.usd_per_chf].every(rate => Number.isFinite(rate) && rate > 0 && rate < 100)) {
    throw new Error('Invalid exchange-rate snapshot.');
  }
}
