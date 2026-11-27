import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonContent,
  IonDatetime,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { take } from 'rxjs';
import { DatabaseService } from 'src/app/services/database.service';
import { toDateKey } from 'src/app/utils/date-converter.util';
import { FormatDatePipe } from 'src/app/pipes/format-date.pipe';

@Component({
  selector: 'app-delete-weight-logs-modal',
  templateUrl: './delete-weight-logs-modal.component.html',
  styleUrls: ['./delete-weight-logs-modal.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonModal,
    IonDatetime,
    FormatDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteWeightLogsModalComponent {
  private readonly db = inject(DatabaseService);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);

  readonly maxDate = toDateKey(new Date());
  readonly startDate = signal(this.db.entries()[0]?.date.substring(0, 10) ?? this.maxDate);
  readonly endDate = signal(this.maxDate);

  readonly isValid = computed(() => this.startDate() <= this.endDate());
  readonly matchingCount = computed(() => {
    if (!this.isValid()) return 0;
    const start = this.startDate();
    const end = this.endDate();
    return this.db.entries().filter(e => {
      const day = e.date.substring(0, 10);
      return day >= start && day <= end;
    }).length;
  });

  onStartDateChange(event: CustomEvent): void {
    this.startDate.set(String(event.detail.value).substring(0, 10));
  }

  onEndDateChange(event: CustomEvent): void {
    this.endDate.set(String(event.detail.value).substring(0, 10));
  }

  async confirmDelete(): Promise<void> {
    const count = this.matchingCount();
    const alert = await this.alertCtrl.create({
      header: 'Delete weight logs?',
      message: `${count} ${count === 1 ? 'weight log' : 'weight logs'} from ${this.startDate()} to ${this.endDate()} will be permanently deleted.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.db.deleteEntriesInRange(this.startDate(), this.endDate()).pipe(take(1)).subscribe();
            this.modalCtrl.dismiss(count, 'deleted');
          },
        },
      ],
    });
    await alert.present();
  }
}
