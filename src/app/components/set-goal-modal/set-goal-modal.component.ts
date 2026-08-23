import { ChangeDetectionStrategy, Component, inject, Input, OnInit, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, refreshOutline } from 'ionicons/icons';
import { DatabaseService, Goal, GoalDB, GoalType, WeightUnit } from 'src/app/services/database.service';
import { PureFnPipe } from 'src/app/pipes/pure-fn.pipe';
import { take } from 'rxjs';
import { formatWeight } from 'src/app/utils/unit-conversion.util';
import { todayLocalMidnightString, toLocalMidnightString } from 'src/app/utils/date-converter.util';

@Component({
  selector: 'app-set-goal-modal',
  templateUrl: './set-goal-modal.component.html',
  styleUrls: ['./set-goal-modal.component.scss'],
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButton,
    IonChip,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonToggle,
    PureFnPipe
],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetGoalModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly db = inject(DatabaseService);

  @Input() goal?: Goal;

  isEditing = false;
  useCustomEndDate = false;
  weeklyRate = 0.5;
  readonly weightUnit: Signal<WeightUnit> = this.db.weightUnit;

  readonly formData = {
    startWeight: null as number | null,
    weight: null as number | null,
    startDate: '',
    endDate: '',
    type: 'Weight Loss' as GoalType,
  };

  constructor() {
    addIcons({ closeOutline, refreshOutline });
  }

  ngOnInit(): void {
    this.refreshStartWeight();

    if (!this.isEditing) {
      this.formData.startDate = this.getDefaultStartDate();
    }

    if (this.goal) {
      this.isEditing = true;
      this.formData.startWeight = this.goal.startWeight;
      this.formData.weight = this.goal.goalWeight;
      this.formData.startDate = this.goal.startDate.substring(0, 10);
      this.formData.endDate = this.goal.goalDate.substring(0, 10);
      this.formData.type = this.goal.type;

      if (this.goal.goalDateMs && this.goal.startWeight && this.goal.goalWeight) {
        const days = (this.goal.goalDateMs - this.goal.startDateMs) / (1000 * 60 * 60 * 24);
        const weeks = days / 7;
        const totalChange = Math.abs(this.goal.goalWeight - this.goal.startWeight);
        if (weeks > 0 && totalChange > 0) {
          this.weeklyRate = parseFloat(((totalChange / weeks / this.goal.startWeight) * 100).toFixed(2));
        }
      }
    }
  }

  refreshStartWeight(): void {
    this.formData.startWeight = parseFloat(formatWeight(this.db.latestEntry()?.trend ?? 0, this.weightUnit()));
    this.onStartWeightChange();
  }

  selectGoalType(type: GoalType): void {
    this.formData.type = type;
    this.onGoalTypeChange();
  }

  private onGoalTypeChange(): void {
    if (this.formData.type === 'Maintenance') {
      this.formData.weight = this.formData.startWeight;
    } else if (!this.goal) {
      if (this.formData.type === 'Weight Gain') {
        this.weeklyRate = 0.25;
      } else {
        this.weeklyRate = 0.5;
      }
    }
    this.recalculateEndDate();
  }

  onStartWeightChange(): void {
    if (this.formData.type === 'Maintenance') {
      this.formData.weight = this.formData.startWeight;
    }
    this.recalculateEndDate();
  }

  onCustomEndDateToggle(): void {
    if (!this.useCustomEndDate) {
      this.recalculateEndDate();
    }
  }

  recalculateEndDate(): void {
    if (this.useCustomEndDate || this.formData.type === 'Maintenance') return;
    if (!this.weeklyRate || !this.formData.startWeight || !this.formData.weight || !this.formData.startDate) return;
    if (this.weeklyRate <= 0) return;

    const totalChange = Math.abs(this.formData.weight - this.formData.startWeight);
    const weeklyChange = this.formData.startWeight * (this.weeklyRate / 100);
    const weeks = totalChange / weeklyChange;
    const days = Math.ceil(weeks * 7);

    const normalizedDateStr = this.formData.startDate + 'T00:00:00'; // Must be in this format for Date constructor to treat it as local time
    const start = new Date(normalizedDateStr);
    start.setDate(start.getDate() + days);
    this.formData.endDate = toLocalMidnightString(start).substring(0, 10);
  }

  get isFormValid(): boolean {
    if (!this.formData.weight || !this.formData.startDate || !this.formData.endDate || !this.formData.startWeight) return false;

    if (!this.useCustomEndDate && this.formData.type !== 'Maintenance' && !this.weeklyRate) return false;

    if (this.formData.startDate >= this.formData.endDate) return false;

    const w = this.formData.weight;
    const s = this.formData.startWeight;

    if (this.formData.type === 'Weight Loss' && w >= s) return false;
    if (this.formData.type === 'Weight Gain' && w <= s) return false;
    if (this.formData.type === 'Maintenance' && w !== s) return false;

    // Overlap check
    if (this.getOverlapError(this.formData.startDate, this.formData.endDate)) return false;

    return true;
  }

  filterKey(event: KeyboardEvent): void {
    if (['e', 'E', '+', '-'].includes(event.key)) {
      event.preventDefault();
    }
  }

  submit(): void {
    if (!this.isFormValid) return;

    const result: Partial<GoalDB> & {
      start_weight_kg: number;
      goal_weight_kg: number;
      start_date: string;
      goal_date: string;
      type: GoalType;
    } = {
      start_weight_kg: this.formData.startWeight!,
      goal_weight_kg: this.formData.weight!,
      start_date: this.formData.startDate,
      goal_date: this.formData.endDate,
      type: this.formData.type,
    };

    if (this.isEditing && this.goal) {
      this.db
        .updateGoal({ id: this.goal.id, ...result })
        .pipe(take(1))
        .subscribe();
    } else {
      this.db.addGoal(result).pipe(take(1)).subscribe();
    }

    this.modalCtrl.dismiss(null, 'confirm');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private getDefaultStartDate(): string {
    const today = todayLocalMidnightString();
    const todayForForm = today.substring(0, 10);

    if (this.db.goals().length === 0) return todayForForm;

    // Default to end date of the latest goal
    const sorted = [...this.db.goals()].sort((a, b) => a.goalDate.localeCompare(b.goalDate));
    const lastEnd = sorted[sorted.length - 1].goalDate.substring(0, 10);
    return lastEnd > today ? lastEnd : todayForForm;
  }

  // ── Piped Methods ───────────────────────────────────────────────────────

  getSpeedLabel = (label: GoalType): string => {
    if (label === 'Weight Loss') return 'Rate (%/week) — recommended: 0.5–1.0';
    if (label === 'Weight Gain') return 'Rate (%/week) — recommended: 0.25–0.5';
    return 'Rate (%/week)';
  };

  getWeightDirectionError = (weight: number | null, startWeight: number | null, label: GoalType): string => {
    if (!weight || !startWeight) return '';
    if (label === 'Weight Loss' && weight >= startWeight) {
      return 'Target weight must be lower than start weight for Weight Loss';
    }
    if (label === 'Weight Gain' && weight <= startWeight) {
      return 'Target weight must be higher than start weight for Weight Gain';
    }
    return '';
  };

  getDateError = (startDate: string, endDate: string): string => {
    if (!startDate || !endDate) return '';
    if (endDate <= startDate) {
      return 'End date must be after start date';
    }
    return '';
  };

  getOverlapError = (startDate: string, endDate: string): string => {
    if (!startDate || !endDate) return '';
    for (const g of this.db.goals()) {
      if (this.isEditing && this.goal && g.id === this.goal.id) continue;
      const gStart = g.startDate.substring(0, 10);
      const gEnd = g.goalDate.substring(0, 10);
      if (startDate < gEnd && endDate > gStart) {
        return `Overlaps with existing goal (${gStart} – ${gEnd})`;
      }
    }
    return '';
  };
}
