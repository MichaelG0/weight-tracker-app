import { ChangeDetectionStrategy, Component, inject, Input, ViewChild } from '@angular/core';
import { IonButton, IonButtons, IonFooter, IonHeader, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { WeightPickerComponent } from 'src/app/components/weight-picker/weight-picker.component';
import { DatabaseService } from 'src/app/services/database.service';

@Component({
  selector: 'app-weight-picker-modal',
  templateUrl: './weight-picker-modal.component.html',
  styleUrls: ['./weight-picker-modal.component.scss'],
  imports: [IonHeader, IonFooter, IonToolbar, IonTitle, IonButton, IonButtons, WeightPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightPickerModalComponent {
  private readonly modalCtrl = inject(ModalController);
  private readonly db = inject(DatabaseService);

  @Input() value: number | null = null;

  @ViewChild(WeightPickerComponent) picker!: WeightPickerComponent;

  readonly unit = this.db.weightUnit;

  ionViewDidEnter(): void {
    this.picker.scrollToValue();
  }

  confirm(): void {
    this.modalCtrl.dismiss(this.picker.weight(), 'confirm');
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
