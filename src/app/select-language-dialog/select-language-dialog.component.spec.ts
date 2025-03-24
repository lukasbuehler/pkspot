import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectLanguageDialogComponent } from './select-language-dialog.component';

describe('SelectLanguageDialogComponent', () => {
  let component: SelectLanguageDialogComponent;
  let fixture: ComponentFixture<SelectLanguageDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectLanguageDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectLanguageDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
