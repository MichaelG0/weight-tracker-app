import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  InfiniteScrollCustomEvent,
  IonContent,
  IonHeader,
  IonTitle,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonList,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { analyticsOutline, create, trashOutline, documentTextOutline } from 'ionicons/icons';
import { take } from 'rxjs';
import { DatabaseService, WeightEntry } from 'src/app/services/database.service';
import { LogWeightModalComponent } from 'src/app/components/log-weight-modal/log-weight-modal.component';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { DeckCardOptionsDirective } from 'src/app/directives/deck-card-options.directive';
import { PureFnPipe } from 'src/app/pipes/pure-fn.pipe';
import { todayLocalMidnightDate } from 'src/app/utils/date-converter.util';

const LIST_PAGE_SIZE = 50;

interface HistoryEntry extends WeightEntry {
  weightChangeKg: number | null;
}

@Component({
  selector: 'app-history',
  templateUrl: 'history.page.html',
  styleUrls: ['history.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonItemSliding,
    IonItemOption,
    IonItemOptions,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    GlassHeaderBackdropDirective,
    DeckCardOptionsDirective,
    PureFnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage {
  private readonly db = inject(DatabaseService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  readonly listVisibleCount = signal(LIST_PAGE_SIZE);
  readonly unitLabel = toSignal(this.db.weightUnit$, { initialValue: 'kg' });

  readonly listEntries = computed<HistoryEntry[]>(() => {
    const desc = [...this.db.entries()].reverse();
    return desc.map((entry, index) => {
      const olderEntry = desc[index + 1];
      return {
        ...entry,
        weightChangeKg: olderEntry ? entry.weight - olderEntry.weight : null,
      };
    });
  });

  readonly visibleListEntries = computed(() => this.listEntries().slice(0, this.listVisibleCount()));
  readonly hasMoreListEntries = computed(() => this.visibleListEntries().length < this.listEntries().length);

  private readonly currentYear = todayLocalMidnightDate().getFullYear();

  constructor() {
    addIcons({ analyticsOutline, create, trashOutline, documentTextOutline });
  }

  onInfiniteScroll(event: InfiniteScrollCustomEvent): void {
    this.listVisibleCount.update(count => count + LIST_PAGE_SIZE);
    event.target.complete();
  }

  async onEdit(entry: HistoryEntry): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: LogWeightModalComponent,
      componentProps: {
        formData: {
          existingEntryId: entry.id,
          weight: entry.weight,
          selectedDate: entry.date,
          notes: entry.notes ?? '',
        },
      },
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });

    await modal.present();
  }

  async onDelete(entry: HistoryEntry): Promise<void> {
    // 1. Delete immediately
    this.db.deleteEntry(entry.id).pipe(take(1)).subscribe();

    // 2. Show toast with undo button
    const toast = await this.toastCtrl.create({
      message: 'Weight entry deleted',
      duration: 5000,
      swipeGesture: 'vertical',
      position: 'bottom',
      buttons: [
        {
          text: 'Undo',
          role: 'cancel',
          handler: () => {
            this.db
              .addEntry({
                weight_kg: entry.weight,
                logged_at: String(entry.date),
                notes: entry.notes,
              })
              .pipe(take(1))
              .subscribe();
          },
        },
      ],
    });

    await toast.present();
  }

  // ─── Piped methods ──────────────────────────────────────────────────────────────────

  readonly formatEntryDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
    };

    // Only show the year if it is not the current year
    if (date.getFullYear() !== this.currentYear) {
      options.year = 'numeric';
    }

    return date.toLocaleDateString(undefined, options);
  };
}
