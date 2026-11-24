import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cloudUploadOutline } from 'ionicons/icons';
import { take } from 'rxjs/operators';
import { DatabaseService } from '../../services/database.service';
import { parseWeightLogsCsv } from '../../utils/weight-log-csv.util';

@Component({
  selector: 'app-csv-import',
  templateUrl: 'csv-import.page.html',
  styleUrls: ['csv-import.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsvImportPage {
  private db = inject(DatabaseService);
  private toastCtrl = inject(ToastController);

  @ViewChild('importInput') private importInput!: ElementRef<HTMLInputElement>;

  constructor() {
    addIcons({ cloudUploadOutline });
  }

  openFilePicker(): void {
    this.importInput.nativeElement.click();
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const { rows, invalidRows } = parseWeightLogsCsv(await file.text(), this.db.weightUnit());
      if (!rows.length) {
        this.showToast('No valid weight logs found in file');
        return;
      }

      this.db
        .importEntries(rows)
        .pipe(take(1))
        .subscribe(({ added, skipped }) => {
          const parts = [`Imported ${added} ${added === 1 ? 'log' : 'logs'}`];
          if (skipped) parts.push(`skipped ${skipped} duplicate ${skipped === 1 ? 'date' : 'dates'}`);
          if (invalidRows) parts.push(`ignored ${invalidRows} invalid ${invalidRows === 1 ? 'row' : 'rows'}`);
          this.showToast(parts.join(', '));
        });
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Could not read CSV file');
    }
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3000, position: 'bottom' });
    await toast.present();
  }
}
