import { ChangeDetectionStrategy, Component, inject, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { Goal } from 'src/app/services/database.service';

@Component({
  selector: 'app-set-goal-modal',
  templateUrl: './set-goal-modal.component.html',
  styleUrls: ['./set-goal-modal.component.scss'],
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonList, IonItem, IonInput, IonDatetime],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetGoalModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);

  @Input() goal?: Goal;

  isEditing = false;

  readonly maxDate = new Date(new Date().getFullYear() + 100, 11, 31).toISOString();

  readonly formData = {
    weight: null as number | null,
    date: '',
    label: '',
  };

  constructor() {
    addIcons({ closeOutline });
  }

  ngOnInit(): void {
    if (this.goal) {
      this.isEditing = true;
      this.formData.weight = this.goal.goal_weight_kg;
      this.formData.date = this.goal.goal_date.substring(0, 10);
      this.formData.label = this.goal.label ?? '';
    }
  }

  filterKey(event: KeyboardEvent): void {
    if (['e', 'E', '+', '-'].includes(event.key)) {
      event.preventDefault();
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  submit(): void {
    if (!this.formData.weight || !this.formData.date) return;

    const result: Partial<Goal> & { goal_weight_kg: number; goal_date: string } = {
      goal_weight_kg: this.formData.weight,
      goal_date: this.formData.date.substring(0, 10),
      label: this.formData.label || undefined,
    };

    if (this.isEditing && this.goal) {
      result.id = this.goal.id;
    }

    this.modalCtrl.dismiss(result, 'confirm');
  }
}
