import { ChangeDetectionStrategy, Component, LOCALE_ID, PLATFORM_ID, computed, inject, resource, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { form, FormField, required, maxLength } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthenticationService } from '../../services/firebase/authentication.service';
import { FinancesService } from '../../services/firebase/firestore/finances.service';
import { FINANCE_CATEGORIES, DisplayCurrency, FinanceCategory, FinanceEntry, FinanceKind, FinanceRates, FinanceStatus, compileFinanceRates, summarizeFinances } from '../../shared/finance';

@Component({
  selector: 'app-finances-page',
  imports: [FormField, MatButtonModule, MatExpansionModule, MatFormFieldModule, MatInputModule],
  templateUrl: './finances-page.component.html',
  styleUrl: './finances-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancesPageComponent {
  readonly auth = inject(AuthenticationService);
  private readonly service = inject(FinancesService);
  private readonly locale = inject(LOCALE_ID);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  readonly currentYear = Number(this.today.slice(0, 4));
  readonly years = Array.from({ length: Math.max(1, this.currentYear - 2025) }, (_, i) => this.currentYear - i);
  readonly year = signal(this.currentYear);
  readonly currency = signal<DisplayCurrency>('CHF');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly editing = signal(false);
  readonly editId = signal('');
  readonly deleteId = signal('');
  readonly ratesDraft = signal<FinanceRates | null>(null);
  readonly categoryOptions = Object.entries(FINANCE_CATEGORIES).map(([value, label]) => ({ value, label }));
  readonly ledger = resource({
    params: () => this.browser && this.auth.isAdmin() ? this.year() : undefined,
    loader: ({ params }) => this.service.load(params),
  });
  readonly data = computed(() => this.ledger.hasValue() ? this.ledger.value() : undefined);
  readonly rates = computed(() => this.data()?.settings.rates ?? null);
  readonly totals = computed(() => summarizeFinances(this.data()?.entries ?? []));
  readonly effectiveCurrency = computed(() => this.rates() ? this.currency() : 'CHF');
  readonly formatter = computed(() => new Intl.NumberFormat(this.locale, { style: 'currency', currency: this.effectiveCurrency() }));
  readonly exchangeMultiplier = computed(() => {
    const rates = this.rates();
    return this.effectiveCurrency() === 'EUR' ? rates!.eur_per_chf : this.effectiveCurrency() === 'USD' ? rates!.usd_per_chf : 1;
  });
  readonly summaries = computed(() => {
    const totals = this.totals();
    return [
      { label: 'Cash income received', amount: this.money(totals.income) },
      { label: 'Expenses paid', amount: this.money(totals.expenses) },
      { label: 'Founder funding received', amount: this.money(totals.founder) },
      { label: 'Net cash movement', amount: this.money(totals.net) },
    ];
  });
  readonly expenseRows = computed(() => {
    const totals = this.totals();
    return totals.expenseCategories.map(row => ({ ...row, amount: this.money(row.cents), width: totals.expenses ? row.cents / totals.expenses * 100 : 0 }));
  });
  readonly entries = computed(() => [...(this.data()?.entries ?? [])].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).map(entry => ({
    ...entry,
    categoryLabel: FINANCE_CATEGORIES[entry.category],
    kindLabel: ({ income: 'Income', expense: 'Expense', founder: 'Founder funding', in_kind: 'Non-cash benefit' })[entry.kind],
    amount: entry.amount_chf_cents === null ? 'Value not recorded' : this.money(entry.amount_chf_cents),
  })));
  readonly pending = computed(() => ({ income: this.money(this.totals().pendingIncome), expenses: this.money(this.totals().pendingExpenses), inKind: this.money(this.totals().inKind) }));
  readonly rateDescription = computed(() => {
    const rates = this.rates();
    if (!rates) return '';
    return `${rates.start} to ${rates.end} · ${rates.observations} published days · 1 CHF ≈ ${rates.eur_per_chf.toFixed(4)} EUR / ${rates.usd_per_chf.toFixed(4)} USD`;
  });
  readonly entryModel = signal(this.emptyEntry());
  readonly entryForm = form(this.entryModel, fields => {
    required(fields.date);
    required(fields.description);
    maxLength(fields.description, 200);
    maxLength(fields.partner, 120);
    maxLength(fields.notes, 3000);
  });
  readonly notesModel = signal({ notes: '' });
  readonly notesForm = form(this.notesModel, fields => maxLength(fields.notes, 5000));
  readonly notesEditing = signal(false);

  private emptyEntry() {
    return { date: this.today, description: '', partner: '', kind: 'expense' as FinanceKind,
      category: 'infrastructure' as FinanceCategory, status: 'settled' as FinanceStatus, amount: '', notes: '' };
  }

  private money(cents: number): string {
    return this.formatter().format(cents / 100 * this.exchangeMultiplier());
  }

  selectYear(value: string): void {
    const year = Number(value);
    if (!this.years.includes(year)) return;
    this.year.set(year);
    this.currency.set('CHF');
    this.ratesDraft.set(null);
    this.notesEditing.set(false);
    this.deleteId.set('');
    this.error.set('');
  }

  selectCurrency(value: string): void {
    if (value === 'CHF' || value === 'EUR' || value === 'USD') this.currency.set(value);
  }

  openEntry(entry?: FinanceEntry): void {
    this.error.set('');
    this.editId.set(entry?.id ?? crypto.randomUUID());
    this.entryModel.set(entry ? { date: entry.date, description: entry.description, partner: entry.partner,
      kind: entry.kind, category: entry.category, status: entry.status, notes: entry.notes, amount: entry.amount_chf_cents === null ? '' : (entry.amount_chf_cents / 100).toFixed(2) } : {
      ...this.emptyEntry(), date: this.year() === this.currentYear ? this.today : `${this.year()}-01-01`,
    });
    this.editing.set(true);
  }

  async saveEntry(event: Event): Promise<void> {
    event.preventDefault();
    const model = this.entryModel();
    const amount = model.amount.trim();
    if (amount && !/^\d+(\.\d{1,2})?$/.test(amount)) {
      this.error.set('Enter a non-negative CHF amount with at most two decimal places.');
      return;
    }
    const entry: FinanceEntry = { id: this.editId(), date: model.date, description: model.description.trim(),
      partner: model.partner.trim(), category: model.category, kind: model.kind, status: model.status,
      amount_chf_cents: amount ? Math.round(Number(amount) * 100) : null, notes: model.notes.trim() };
    await this.mutate(async () => {
      await this.service.saveEntry(this.year(), entry);
      this.editing.set(false);
    });
  }

  async removeEntry(id: string): Promise<void> {
    await this.mutate(async () => {
      await this.service.deleteEntry(this.year(), id);
      this.deleteId.set('');
    });
  }

  editNotes(): void {
    this.notesModel.set({ notes: this.data()?.settings.notes ?? '' });
    this.notesEditing.set(true);
  }

  async saveNotes(event: Event): Promise<void> {
    event.preventDefault();
    await this.mutate(async () => {
      await this.service.saveSettings(this.year(), { rates: this.rates(), notes: this.notesModel().notes });
      this.notesEditing.set(false);
    });
  }

  async importRates(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const year = this.year();
    this.error.set('');
    this.ratesDraft.set(null);
    try {
      if (file.size > 5_000_000) throw new Error('Choose a CSV smaller than 5 MB.');
      const csv = await file.text();
      if (year === this.year()) this.ratesDraft.set(compileFinanceRates(csv, year, this.today));
    } catch (error) { this.showError(error); }
  }

  async saveRates(): Promise<void> {
    const rates = this.ratesDraft();
    if (!rates) return;
    await this.mutate(async () => {
      await this.service.saveSettings(this.year(), { notes: this.data()?.settings.notes ?? '', rates });
      this.ratesDraft.set(null);
    });
  }

  private async mutate(operation: () => Promise<void>): Promise<void> {
    if (this.busy() || !this.auth.isAdmin()) return;
    this.busy.set(true);
    this.error.set('');
    try { await operation(); this.ledger.reload(); }
    catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }

  private showError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'The operation failed. Please try again.');
  }
}
