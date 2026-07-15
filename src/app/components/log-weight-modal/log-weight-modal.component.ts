import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
export class LogWeightModalComponent {
  private readonly modalCtrl = inject(ModalController);

  readonly maxDate = new Date().toISOString();
  weight: number | null = null;
  selectedDate: string = new Date().toISOString();
  notes: string = '';

  constructor() {
    addIcons({ closeOutline, checkmarkOutline });
  }

  onWeightKeydown(event: KeyboardEvent): void {
    if (['e', 'E', '+', '-'].includes(event.key)) {
      event.preventDefault();
    }
  }

  onWeightInput(event: Event): void {
    const input = (event as CustomEvent).target as HTMLIonInputElement | undefined;
    const raw = String(input?.value ?? '');
    const match = raw.match(/^(\d*\.\d{1})/);
    if (match) {
      input!.value = match[1];
      this.weight = +match[1];
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  save(form: NgForm): void {
    if (form.invalid || this.weight == null || this.weight <= 0) {
      return;
    }

    this.modalCtrl.dismiss(
      {
        weight_kg: this.weight,
        logged_at: this.selectedDate,
        notes: this.notes || undefined,
      },
      'confirm',
    );
  }
}
