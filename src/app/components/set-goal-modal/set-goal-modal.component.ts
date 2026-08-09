import { ChangeDetectionStrategy, Component, inject, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonTitle,
  IonToolbar,
  IonSelect,
  IonSelectOption,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, refreshOutline } from 'ionicons/icons';
import { DatabaseService, Goal, GoalType, WeightEntry } from 'src/app/services/database.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-set-goal-modal',
  templateUrl: './set-goal-modal.component.html',
  styleUrls: ['./set-goal-modal.component.scss'],
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetGoalModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly db = inject(DatabaseService);

  @Input() goal?: Goal;

  isEditing = false;
  overlapError = '';

  private allEntries: WeightEntry[] = [];
  private allGoals: Goal[] = [];

  readonly formData = {
    startWeight: null as number | null,
    weight: null as number | null,
    startDate: '',
    endDate: '',
    label: 'weight loss' as GoalType,
  };

  constructor() {
    addIcons({ closeOutline, refreshOutline });
  }

  ngOnInit(): void {
    // Load existing goals for overlap validation
    this.db.goals$.pipe(take(1)).subscribe(goals => {
      this.allGoals = goals;
      if (!this.isEditing) {
        this.formData.startDate = this.getDefaultStartDate();
      }
    });

    // Grab latest entries for the hacker's diet EMA
    this.db.entries$.pipe(take(1)).subscribe(entries => {
      this.allEntries = [...entries].sort((a, b) => +new Date(a.logged_at) - +new Date(b.logged_at));

      if (!this.isEditing) {
        this.refreshStartWeight();
      }
    });

    if (this.goal) {
      this.isEditing = true;
      this.formData.startWeight = this.goal.start_weight_kg;
      this.formData.weight = this.goal.goal_weight_kg;
      this.formData.startDate = this.goal.start_date.substring(0, 10);
      this.formData.endDate = this.goal.goal_date.substring(0, 10);
      this.formData.label = this.goal.label;
    }
  }

  refreshStartWeight(): void {
    if (this.allEntries.length === 0) return;

    const ALPHA = 0.1;
    let currentTrend = this.allEntries[0].weight_kg;
    for (const entry of this.allEntries) {
      currentTrend = currentTrend + ALPHA * (entry.weight_kg - currentTrend);
    }    

    this.formData.startWeight = parseFloat(currentTrend.toFixed(1));
    this.onStartWeightChange();
  }

  onGoalTypeChange(): void {
    if (this.formData.label === 'maintenance') {
      this.formData.weight = this.formData.startWeight;
    }
  }

  onStartWeightChange(): void {
    if (this.formData.label === 'maintenance') {
      this.formData.weight = this.formData.startWeight;
    }
  }

  get isFormValid(): boolean {
    if (!this.formData.weight || !this.formData.startDate || !this.formData.endDate || !this.formData.startWeight) return false;

    if (this.formData.startDate >= this.formData.endDate) return false;

    const w = this.formData.weight;
    const s = this.formData.startWeight;

    if (this.formData.label === 'weight loss' && w >= s) return false;
    if (this.formData.label === 'weight gain' && w <= s) return false;
    if (this.formData.label === 'maintenance' && w !== s) return false;

    // Overlap check
    this.overlapError = this.checkOverlap();
    if (this.overlapError) return false;

    return true;
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
    if (!this.isFormValid) return;

    const result: Partial<Goal> & { start_weight_kg: number; goal_weight_kg: number; start_date: string; goal_date: string; label: GoalType } = {
      start_weight_kg: this.formData.startWeight!,
      goal_weight_kg: this.formData.weight!,
      start_date: this.formData.startDate,
      goal_date: this.formData.endDate,
      label: this.formData.label,
    };

    if (this.isEditing && this.goal) {
      result.id = this.goal.id;
    }

    this.modalCtrl.dismiss(result, 'confirm');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private getDefaultStartDate(): string {
    const today = new Date().toISOString().substring(0, 10);

    if (this.allGoals.length === 0) return today;

    // Default to end date of the latest goal
    const sorted = [...this.allGoals].sort((a, b) => a.goal_date.localeCompare(b.goal_date));
    const lastEnd = sorted[sorted.length - 1].goal_date.substring(0, 10);
    return lastEnd > today ? lastEnd : today;
  }

  private checkOverlap(): string {
    const start = this.formData.startDate;
    const end = this.formData.endDate;
    if (!start || !end) return '';

    for (const g of this.allGoals) {
      // Skip the goal being edited
      if (this.isEditing && this.goal && g.id === this.goal.id) continue;

      const gStart = g.start_date.substring(0, 10);
      const gEnd = g.goal_date.substring(0, 10);

      // Two ranges overlap if one starts before the other ends and vice versa
      if (start < gEnd && end > gStart) {
        return `Overlaps with existing goal (${gStart} – ${gEnd})`;
      }
    }

    return '';
  }
}
