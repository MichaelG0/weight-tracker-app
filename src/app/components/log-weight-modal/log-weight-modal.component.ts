import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Input,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonHeader,
  IonIcon,
  IonInput,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline } from 'ionicons/icons';
import { WeightEntry } from 'src/app/services/database.service';

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
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonInput,
    IonTextarea,
    IonDatetime,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogWeightModalComponent implements OnInit, AfterViewInit {
  private readonly modalCtrl = inject(ModalController);

  @ViewChild('dateTimePicker', { read: ElementRef }) datetimeEl!: ElementRef;

  private readonly entriesByDate = signal(new Map<string, WeightEntry>());
  @Input() protected set entries(value: WeightEntry[]) {
    const map = new Map<string, WeightEntry>();
    for (const entry of value) {
      const dateKey = entry.logged_at.substring(0, 10);
      map.set(dateKey, entry);
    }
    this.entriesByDate.set(map);
  }
  readonly highlightedDates = computed(() =>
    [...this.entriesByDate().keys()].map(date => ({
      date,
      textColor: 'var(--ion-text-color)',
      backgroundColor: 'rgba(var(--ion-color-primary-rgb), 0)',
    })),
  );
  readonly maxDate = new Date().toISOString();
  readonly formData = {
    existingEntryId: null as number | null,
    weight: null as number | null,
    selectedDate: new Date().toISOString(),
    notes: '',
  };

  constructor() {
    addIcons({ closeOutline, checkmarkOutline });
  }

  ngOnInit(): void {
    this.applyExistingEntry(this.formData.selectedDate);
  }

  ngAfterViewInit(): void {
    requestAnimationFrame(() => {
      this.injectDotStyles();
    });
  }

  private injectDotStyles(): void {
    // Treat this as regular scss that would be written inside global.scss.
    // It's not possible to write it there only because the selector would have been something like
    // ion-datetime::part(calendar-day)[style*="background-color"]
    // which is not supported.
    const el = this.datetimeEl?.nativeElement;
    const shadowRoot = el?.shadowRoot;
    if (!shadowRoot) return;

    const css = `
      .calendar-day[style*="background-color"] {
        position: relative;
        background-color: transparent !important;
      }
      .calendar-day[style*="background-color"]::after {
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
    `;

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);

    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
  }

  onDateChange(event: CustomEvent): void {
    const value = event.detail.value as string;
    this.applyExistingEntry(value);
  }

  private applyExistingEntry(dateStr: string): void {
    const dateKey = dateStr.substring(0, 10);
    const existing = this.entriesByDate().get(dateKey);

    if (existing) {
      this.formData.existingEntryId = existing.id;
      this.formData.weight = existing.weight_kg;
      this.formData.notes = existing.notes ?? '';
    } else {
      this.formData.existingEntryId = null;
      this.formData.weight = null;
      this.formData.notes = '';
    }
  }

  onWeightKeydown(event: KeyboardEvent): void {
    if (['e', 'E', '+', '-'].includes(event.key)) {
      event.preventDefault();
    }
  }

  onWeightInput(event: CustomEvent): void {
    const input = event.target as HTMLIonInputElement | undefined;
    const raw = String(input?.value ?? '');
    const match = raw.match(/^(\d*\.\d{1})/);
    if (match) {
      input!.value = match[1];
      this.formData.weight = +match[1];
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  save(form: NgForm): void {
    if (form.invalid || this.formData.weight == null || this.formData.weight <= 0) {
      return;
    }

    this.modalCtrl.dismiss(
      {
        ...(this.formData.existingEntryId ? { id: this.formData.existingEntryId } : {}),
        weight_kg: this.formData.weight,
        logged_at: this.formData.selectedDate,
        notes: this.formData.notes || undefined,
      },
      'confirm',
    );
  }
}
