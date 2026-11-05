import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Signal,
  ViewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonDatetime,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonModal,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline } from 'ionicons/icons';
import { take } from 'rxjs/operators';
import { WeightPickerComponent } from 'src/app/components/weight-picker/weight-picker.component';
import { WeightEntry, DatabaseService } from 'src/app/services/database.service';
import { todayLocalMidnightString } from 'src/app/utils/date-converter.util';
import { FormatDatePipe } from '../../pipes/format-date.pipe';

@Component({
  selector: 'app-log-weight-modal',
  templateUrl: './log-weight-modal.component.html',
  styleUrls: ['./log-weight-modal.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButton,
    IonContent,
    IonInput,
    IonModal,
    IonTextarea,
    IonDatetime,
    IonList,
    IonItem,
    WeightPickerComponent,
    FormatDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogWeightModalComponent implements OnInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);
  private readonly db = inject(DatabaseService);

  @ViewChild('dateTimePicker', { read: ElementRef }) datetimeEl?: ElementRef<HTMLElement>;
  @ViewChild(WeightPickerComponent) weightPicker!: WeightPickerComponent;

  private readonly entriesByDate: Signal<Map<string, WeightEntry>> = computed(() => {
    const map = new Map<string, WeightEntry>();
    for (const entry of this.db.entries()) {
      const dateKey = entry.date.substring(0, 10);
      map.set(dateKey, entry);
    }
    return map;
  });
  readonly maxDate = todayLocalMidnightString();
  @Input() readonly formData = {
    existingEntryId: null as number | null,
    weight: this.db.latestEntry()?.weight as number | null,
    selectedDate: todayLocalMidnightString(),
    notes: '',
  };

  constructor() {
    addIcons({ closeOutline, checkmarkOutline });
  }

  ngOnInit(): void {
    if (this.entriesByDate().has(this.formData.selectedDate.substring(0, 10))) {
      this.applyExistingEntry(this.formData.selectedDate);
    }
  }

  ionViewDidEnter(): void {
    this.weightPicker.scrollToValue();
  }

  onDateChange(event: CustomEvent): void {
    this.formData.selectedDate = event.detail.value as string;
    this.applyExistingEntry(this.formData.selectedDate);
  }

  private applyExistingEntry(dateStr: string): void {
    const dateKey = dateStr.substring(0, 10);
    const existing = this.entriesByDate().get(dateKey);

    if (existing) {
      this.formData.existingEntryId = existing.id;
      this.formData.weight = existing.weight;
      this.formData.notes = existing.notes ?? '';
    } else {
      this.formData.existingEntryId = null;
      this.formData.weight = null;
      this.formData.notes = '';
    }
  }

  save(form: NgForm): void {
    if (form.invalid || this.formData.weight == null || this.formData.weight <= 0) {
      return;
    }

    const entry = {
      weight_kg: this.formData.weight,
      logged_at: this.formData.selectedDate,
      notes: this.formData.notes || undefined,
    };

    if (this.formData.existingEntryId != null) {
      this.db
        .updateEntry({ id: this.formData.existingEntryId, ...entry })
        .pipe(take(1))
        .subscribe();
    } else {
      this.db.addEntry(entry).pipe(take(1)).subscribe();
    }

    this.modalCtrl.dismiss(null, 'confirm');
  }

  // ── Calendar dot styles ─────────────────────────────────────────────────────────

  private dotObserver?: MutationObserver;

  onDateModalPresented(): void {
    const shadowRoot = this.datetimeEl?.nativeElement.shadowRoot;
    if (!shadowRoot) return;

    this.dotObserver?.disconnect();
    this.injectDotStyles(shadowRoot);
    this.syncEntryDots(shadowRoot);

    // ion-datetime only emits ionChange on Done, but re-renders its day buttons on every tap,
    // so the dots are kept in sync from DOM mutations instead.
    this.dotObserver = new MutationObserver(() => this.syncEntryDots(shadowRoot));
    this.dotObserver.observe(shadowRoot, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-day', 'data-month', 'data-year'],
    });
  }

  ngOnDestroy(): void {
    this.dotObserver?.disconnect();
  }

  private injectDotStyles(shadowRoot: ShadowRoot): void {
    // The day buttons live in ion-datetime's shadow root, so the dot styles are injected there.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      .calendar-day[data-day].has-entry-dot {
        position: relative;
      }
      .calendar-day[data-day].has-entry-dot::after {
        content: '';
        position: absolute;
        top: 4px;
        left: 50%;
        transform: translateX(-50%);
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--ion-color-primary);
      }
      .calendar-day[data-day].has-entry-dot.calendar-day-active::after {
        background: var(--ion-color-primary-contrast);
      }
    `);

    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
  }

  private syncEntryDots(shadowRoot: ShadowRoot): void {
    // Each day button carries its own date, so the dot reflects the day itself, not the current selection.
    shadowRoot.querySelectorAll<HTMLElement>('.calendar-day[data-day]').forEach((button, index) => {
      const year = button.dataset['year'];
      const month = String(button.dataset['month']).padStart(2, '0');
      const day = String(button.dataset['day']).padStart(2, '0');
      button.classList.toggle('has-entry-dot', this.entriesByDate().has(`${year}-${month}-${day}`));
    });
  }
}
