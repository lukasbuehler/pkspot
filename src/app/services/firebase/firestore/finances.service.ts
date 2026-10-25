import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment.default';
import { AuthenticationService } from '../authentication.service';
import { FirestoreAdapterService } from '../firestore-adapter.service';
import { FinanceEntry, FinanceLedger, FinanceYear, validateFinanceEntry, validateFinanceRates } from '../../../shared/finance';

@Injectable({ providedIn: 'root' })
export class FinancesService {
  private readonly db = inject(FirestoreAdapterService);
  private readonly auth = inject(AuthenticationService);

  private path(year: number): string {
    if (!this.auth.isAdmin()) throw new Error('Administrator access is required.');
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('Invalid reporting year.');
    return `finance_years/${year}`;
  }

  private fixture(): FinanceLedger | undefined {
    // Development-only, synthetic screenshot records never bypass production rules.
    return environment.production ? undefined : (globalThis as typeof globalThis & {
      __PKSPOT_SCREENSHOT_FINANCES__?: FinanceLedger;
    }).__PKSPOT_SCREENSHOT_FINANCES__;
  }

  async load(year: number): Promise<FinanceLedger> {
    const path = this.path(year);
    const fixture = this.fixture();
    if (fixture) return structuredClone(fixture);
    const [settings, entries] = await Promise.all([
      this.db.getDocument<FinanceYear>(path),
      this.db.getCollection<FinanceEntry>(`${path}/entries`),
    ]);
    return { entries, settings: { notes: settings?.notes ?? '', rates: settings?.rates ?? null } };
  }

  async saveEntry(year: number, entry: FinanceEntry): Promise<void> {
    const path = this.path(year);
    validateFinanceEntry(entry, year);
    if (this.fixture()) throw new Error('Screenshot data is read-only.');
    const { id, ...data } = entry;
    await this.db.setDocument(`${path}/entries/${id}`, data);
  }

  async deleteEntry(year: number, id: string): Promise<void> {
    const path = this.path(year);
    if (!/^[\w-]{1,80}$/.test(id)) throw new Error('Invalid entry ID.');
    if (this.fixture()) throw new Error('Screenshot data is read-only.');
    await this.db.deleteDocument(`${path}/entries/${id}`);
  }

  async saveSettings(year: number, settings: FinanceYear): Promise<void> {
    const path = this.path(year);
    if (settings.notes.length > 5000) throw new Error('Keep reporting notes within 5,000 characters.');
    if (settings.rates) validateFinanceRates(settings.rates, year);
    if (this.fixture()) throw new Error('Screenshot data is read-only.');
    await this.db.setDocument(path, { notes: settings.notes, rates: settings.rates });
  }
}
