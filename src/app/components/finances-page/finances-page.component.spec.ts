import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticationService } from '../../services/firebase/authentication.service';
import { FinancesService } from '../../services/firebase/firestore/finances.service';
import { FinancesPageComponent } from './finances-page.component';

describe('FinancesPageComponent access', () => {
  async function setup(admin: boolean) {
    const isAdmin = signal(admin);
    const service = { load: vi.fn().mockResolvedValue({ entries: [], settings: { notes: '', rates: null } }), saveEntry: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({ imports: [FinancesPageComponent], providers: [
      { provide: AuthenticationService, useValue: { isAdmin, authorizationStateResolved: signal(true) } },
      { provide: FinancesService, useValue: service },
    ] });
    const fixture = TestBed.createComponent(FinancesPageComponent);
    await fixture.whenStable();
    return { fixture, service, isAdmin };
  }
  it('does not load private records for non-admins', async () => {
    const { fixture, service } = await setup(false);
    expect(service.load).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('administrators only');
    expect(fixture.nativeElement.querySelector('.summary-grid')).toBeNull();
  });
  it('loads for admins and hides financial content after access is revoked', async () => {
    const { fixture, service, isAdmin } = await setup(true);
    expect(service.load).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.summary-grid')).not.toBeNull();
    isAdmin.set(false);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.summary-grid')).toBeNull();
  });
  it('keeps a blank non-cash value unknown and rejects fractional CHF cents', async () => {
    const { fixture, service } = await setup(true);
    const component = fixture.componentInstance;
    component.openEntry();
    component.entryModel.update(value => ({ ...value, description: 'Ticket', kind: 'in_kind', amount: '' }));
    await component.saveEntry(new Event('submit'));
    expect(service.saveEntry).toHaveBeenCalledWith(component.year(), expect.objectContaining({ kind: 'in_kind', amount_chf_cents: null }));
    service.saveEntry.mockClear();
    component.openEntry();
    component.entryModel.update(value => ({ ...value, description: 'Hosting', amount: '0.001' }));
    await component.saveEntry(new Event('submit'));
    expect(service.saveEntry).not.toHaveBeenCalled();
  });
});
