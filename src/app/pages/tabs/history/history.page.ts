import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  InfiniteScrollCustomEvent,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { analyticsOutline } from 'ionicons/icons';
import { DatabaseService, WeightEntry } from 'src/app/services/database.service';

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
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage {
  private readonly db = inject(DatabaseService);
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
    addIcons({ analyticsOutline });
  }

  onInfiniteScroll(event: InfiniteScrollCustomEvent): void {
    this.listVisibleCount.update(count => count + LIST_PAGE_SIZE);
    event.target.complete();
  }
}
