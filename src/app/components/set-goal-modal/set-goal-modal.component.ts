import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, OnInit, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonChip,
  IonContent,
  IonDatetime,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonModal,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, refreshOutline, sparklesOutline } from 'ionicons/icons';
import { DatabaseService, Goal, GoalDB, GoalType, UserSettingsExtended, WeightUnit } from 'src/app/services/database.service';
import { PureFnPipe } from 'src/app/pipes/pure-fn.pipe';
import { WeightPickerModalComponent } from 'src/app/components/weight-picker-modal/weight-picker-modal.component';
import { RatePickerModalComponent } from 'src/app/components/rate-picker-modal/rate-picker-modal.component';
import { take } from 'rxjs';
import { formatWeight } from 'src/app/utils/unit-conversion.util';
import { todayLocalMidnightString, toLocalMidnightString } from 'src/app/utils/date-converter.util';
import { FormatDatePipe } from '../../pipes/format-date.pipe';
import { FormatWeightPipe } from '../../pipes/format-weight.pipe';

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
    IonDatetime,
    IonModal,
    PureFnPipe,
    FormatDatePipe,
    FormatWeightPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetGoalModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly db = inject(DatabaseService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() goal?: Goal;

  isEditing = false;
  useCustomEndDate = false;
  weeklyRate = 0.5;
  readonly weightUnit: Signal<WeightUnit> = this.db.weightUnit;
  readonly extendedSettings: Signal<UserSettingsExtended | null> = this.db.extendedSettings;

  readonly formData = {
    startWeight: null as number | null,
    weight: null as number | null,
    startDate: '',
    endDate: '',
    type: 'Weight Loss' as GoalType,
  };

  constructor() {
    addIcons({ closeOutline, refreshOutline, sparklesOutline });
  }

  ngOnInit(): void {
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
    } else {
      this.refreshStartWeight();
      this.refreshStartDate();
      this.weeklyRate = this.minimumRecommendedRate(this.formData.type);
    }
  }

  refreshStartWeight(): void {
    this.formData.startWeight = parseFloat(formatWeight(this.db.trendOnOrBefore(this.formData.startDate) ?? 0, this.weightUnit()));
    this.onStartWeightChange();
  }

  refreshStartDate(): void {
    const today = todayLocalMidnightString();
    const todayForForm = today.substring(0, 10);

    if (this.db.goals().length === 0) {
      this.formData.startDate = todayForForm;
      return;
    }

    // Default to end date of the latest goal
    const sorted = [...this.db.goals()].sort((a, b) => a.goalDate.localeCompare(b.goalDate));
    const lastEnd = sorted[sorted.length - 1].goalDate.substring(0, 10);
    this.formData.startDate = lastEnd > today ? lastEnd : todayForForm;

    this.recalculateEndDate();
  }

  selectGoalType(type: GoalType): void {
    this.formData.type = type;
    this.onGoalTypeChange();
  }

  private onGoalTypeChange(): void {
    if (this.formData.type === 'Maintenance') {
      this.formData.weight = this.formData.startWeight;
    } else if (!this.goal) {
      this.weeklyRate = this.minimumRecommendedRate(this.formData.type);
    }
    this.recalculateEndDate();
  }

  onStartWeightChange(): void {
    if (this.formData.type === 'Maintenance') {
      this.formData.weight = this.formData.startWeight;
    }
    this.recalculateEndDate();
  }

  async openWeightPicker(field: 'startWeight' | 'weight'): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: WeightPickerModalComponent,
      componentProps: { value: this.formData[field] },
      cssClass: 'weight-picker-modal',
    });
    await modal.present();

    const { data, role } = await modal.onDidDismiss<number | null>();
    if (role !== 'confirm' || data == null) return;

    this.formData[field] = data;
    if (field === 'startWeight') {
      this.onStartWeightChange();
    } else {
      this.recalculateEndDate();
    }
    this.cdr.markForCheck();
  }

  async openRatePicker(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: RatePickerModalComponent,
      componentProps: { value: this.weeklyRate },
      cssClass: 'rate-picker-modal',
    });
    await modal.present();

    const { data, role } = await modal.onDidDismiss<number | null>();
    if (role !== 'confirm' || data == null) return;

    this.weeklyRate = data;
    this.recalculateEndDate();
    this.cdr.markForCheck();
  }

  onStartDateChange(event: CustomEvent): void {
    this.formData.startDate = event.detail.value;
    this.recalculateEndDate();
  }

  onEndDateChange(event: CustomEvent): void {
    this.formData.endDate = event.detail.value;
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

  submit(): void {
    if (
      !this.isFormValid(
        this.formData.weight,
        this.formData.startWeight,
        this.formData.startDate,
        this.formData.endDate,
        this.formData.type,
        this.weeklyRate,
        this.useCustomEndDate,
      )
    )
      return;

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

  private minimumRecommendedRate(goalType: GoalType): number {
    const coaching = this.db.extendedSettings()?.coaching;
    if (goalType === 'Weight Gain') return coaching?.idealGainFloorPct ?? 0.25;
    return coaching?.idealLossFloorPct ?? 0.5;
  }

  // ── Piped Methods ───────────────────────────────────────────────────────

  isFormValid = (
    weight: number | null,
    startWeight: number | null,
    startDate: string,
    endDate: string,
    type: GoalType,
    weeklyRate: number,
    useCustomEndDate: boolean,
  ): boolean => {
    console.log('Validating form with:', { weight, startWeight, startDate, endDate, type, weeklyRate, useCustomEndDate });
    if (!weight || !startDate || !endDate || !startWeight) return false;

    if (!useCustomEndDate && type !== 'Maintenance' && !weeklyRate) return false;

    if (startDate >= endDate) return false;

    if (type === 'Weight Loss' && weight >= startWeight) return false;
    if (type === 'Weight Gain' && weight <= startWeight) return false;
    if (type === 'Maintenance' && weight !== startWeight) return false;

    // Overlap check
    if (this.getOverlapError(startDate, endDate)) return false;

    return true;
  };

  getRecommendedRateText = (goalType: GoalType, settings: UserSettingsExtended | null): string | null => {
    const coaching = settings?.coaching;
    if (!coaching) return null;

    let low: number;
    let high: number;
    if (goalType === 'Weight Loss') {
      low = coaching.idealLossFloorPct;
      high = coaching.maxLossRate;
    } else if (goalType === 'Weight Gain') {
      low = coaching.idealGainFloorPct;
      high = coaching.idealGainCeilingPct;
    } else {
      return null;
    }

    const fmt = (n: number) => parseFloat(n.toFixed(2));
    return `Based on your profile, we recommend a rate of ${fmt(low)}% to ${fmt(high)}% of your body weight per week.`;
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
