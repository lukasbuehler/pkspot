import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LocaleMapEditFieldComponent } from './locale-map-edit-field.component';

describe('LocaleMapEditFieldComponent', () => {
  let component: LocaleMapEditFieldComponent;
  let fixture: ComponentFixture<LocaleMapEditFieldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LocaleMapEditFieldComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LocaleMapEditFieldComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
