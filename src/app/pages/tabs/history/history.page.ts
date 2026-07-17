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
  IonLabel,
  IonList,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { analyticsOutline, createOutline, trashOutline } from 'ionicons/icons';
import { take } from 'rxjs';
import { DatabaseService, WeightEntry } from 'src/app/services/database.service';
import { LogWeightModalComponent } from 'src/app/components/log-weight-modal/log-weight-modal.component';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { DeckCardOptionsDirective } from 'src/app/directives/deck-card-options.directive';

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
    IonLabel,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    GlassHeaderBackdropDirective,
    DeckCardOptionsDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage {
  private readonly db = inject(DatabaseService);
  private readonly modalCtrl = inject(ModalController);
  readonly listVisibleCount = signal(LIST_PAGE_SIZE);
  private readonly allEntries = toSignal(this.db.entries$, { initialValue: [] as WeightEntry[] });
  readonly sortedAll = computed(() => [...this.allEntries()].sort((a, b) => +new Date(a.logged_at) - +new Date(b.logged_at)));

  readonly listEntries = computed<HistoryEntry[]>(() => {
    const desc = [...this.sortedAll()].reverse();
    return desc.map((entry, index) => {
      const olderEntry = desc[index + 1];
      return {
        ...entry,
        weightChangeKg: olderEntry ? entry.weight_kg - olderEntry.weight_kg : null,
      };
    });
  });

  readonly visibleListEntries = computed(() => this.listEntries().slice(0, this.listVisibleCount()));
  readonly hasMoreListEntries = computed(() => this.visibleListEntries().length < this.listEntries().length);

  constructor() {
    addIcons({ analyticsOutline, createOutline, trashOutline });
  }

  onInfiniteScroll(event: InfiniteScrollCustomEvent): void {
    this.listVisibleCount.update(count => count + LIST_PAGE_SIZE);
    event.target.complete();
  }

  async onEdit(entry: HistoryEntry): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: LogWeightModalComponent,
      componentProps: {
        entries: this.allEntries(),
        formData: {
          existingEntryId: entry.id,
          weight: entry.weight_kg,
          selectedDate: entry.logged_at,
          notes: entry.notes ?? '',
        },
      },
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });

    await modal.present();

    const { data, role } = await modal.onWillDismiss();

    if (role === 'confirm' && data) {
      if (data.id != null) {
        this.db.updateEntry(data).pipe(take(1)).subscribe();
      } else {
        this.db.addEntry(data).pipe(take(1)).subscribe();
      }
    }
  }

  onDelete(entry: HistoryEntry): void {
    this.db.deleteEntry(entry.id).pipe(take(1)).subscribe();
  }
}
