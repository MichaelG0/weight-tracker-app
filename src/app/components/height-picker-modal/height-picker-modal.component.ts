import { Component, inject, Input, ViewChild } from '@angular/core';
import { IonButton, IonButtons, IonFooter, IonHeader, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { HeightPickerComponent } from 'src/app/components/height-picker/height-picker.component';
import { HeightUnit } from 'src/app/services/database.service';

@Component({
  selector: 'app-height-picker-modal',
  templateUrl: './height-picker-modal.component.html',
  styleUrls: ['./height-picker-modal.component.scss'],
  imports: [IonHeader, IonFooter, IonToolbar, IonTitle, IonButton, IonButtons, HeightPickerComponent],
})
export class HeightPickerModalComponent {
  private readonly modalCtrl = inject(ModalController);

  @Input() value: number | null = null;
  @Input() unit: HeightUnit = 'cm';

  @ViewChild(HeightPickerComponent) picker!: HeightPickerComponent;

  ionViewDidEnter(): void {
    this.picker.scrollToValue();
  }

  confirm(): void {
    this.modalCtrl.dismiss(this.picker.height(), 'confirm');
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
