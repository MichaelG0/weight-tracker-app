import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular/standalone';

import { ProgressPage } from './progress.page';

describe('ProgressPage', () => {
  let component: ProgressPage;
  let fixture: ComponentFixture<ProgressPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressPage],
      providers: [{ provide: ModalController, useValue: {} }],
    }).compileComponents();
    fixture = TestBed.createComponent(ProgressPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
