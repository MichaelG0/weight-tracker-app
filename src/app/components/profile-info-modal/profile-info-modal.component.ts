import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';
import {
  FEMALE_THRESHOLDS,
  HIGH_ACTIVITY_DEFICIT_STEP_MIN,
  HIGH_ACTIVITY_SURPLUS_STEP_MIN,
  IDEAL_LOSS_FLOOR_RATIO,
  LOW_ACTIVITY_STEP_CAP,
  MALE_THRESHOLDS,
  SENIOR_AGE,
  SENIOR_DEFICIT_STEP_CAP,
  SENIOR_MAX_LOSS_RATE_PCT,
} from '../../constants/coaching.constants';
import type { Experience } from '../../services/database.service';

export type ProfileInfoTopic = 'activity' | 'experience' | 'bmi';

interface ActivityInfo {
  name: string;
  subtitle: string;
  body: string;
}

interface ExperienceCopy {
  key: Experience;
  subtitle: string;
  body: string;
}

interface ExperienceInfo extends ExperienceCopy {
  lossMen: string;
  lossWomen: string;
  gainMen: string;
  gainWomen: string;
  deficitMen: number;
  deficitWomen: number;
  surplusMen: number;
  surplusWomen: number;
}

/** Trims floating-point noise (0.35000000000000003 → 0.35). */
const fmt = (n: number): number => Number(n.toFixed(2));

const ACTIVITY_LEVELS: readonly ActivityInfo[] = [
  {
    name: 'Sedentary',
    subtitle: 'Under 5,000 steps/day · No deliberate exercise',
    body: 'Desk job or remote worker. Majority of the day spent seated with minimal walking.',
  },
  {
    name: 'Lightly Active',
    subtitle: '5,000–7,500 steps/day · Light exercise 1–3 days/week',
    body: 'Standing or walking job (teacher, cashier, retail) — or a desk worker who adds light movement like daily walks.',
  },
  {
    name: 'Moderately Active',
    subtitle: '7,500–10,000 steps/day · Moderate exercise 3–5 days/week',
    body: 'On your feet most of the day (nurse, server, tradesperson) — or a desk worker with frequent intense workouts.',
  },
  {
    name: 'Very Active',
    subtitle: '10,000+ steps/day · Hard exercise 6–7 days/week',
    body: 'Physically demanding job (construction, agricultural worker) or an intense athletic training schedule.',
  },
  {
    name: 'Extra Active',
    subtitle: 'Heavy daily labor + intense training',
    body: 'Heavy manual labor (logger, professional athlete, military training) combined with daily endurance or strength work.',
  },
];

const EXPERIENCE_COPY: readonly ExperienceCopy[] = [
  {
    key: 'Beginner',
    subtitle: 'Less than 1 year of consistent resistance training',
    body: 'New to lifting or returning after a long break. You can build muscle quickly, even in a mild deficit. A modest surplus is enough during a bulk, so there is no need to overeat.',
  },
  {
    key: 'Intermediate',
    subtitle: '1–3 years of consistent resistance training',
    body: "You've built a solid base and know your way around the gym. Muscle gain has slowed but is still meaningful. Standard cut and bulk approaches work well.",
  },
  {
    key: 'Advanced',
    subtitle: '3+ years of consistent resistance training',
    body: 'Muscle gain is considerably slower at this stage, so surpluses stay small and cuts are controlled. Keep protein high to protect the muscle you have.',
  },
];

@Component({
  selector: 'app-profile-info-modal',
  templateUrl: 'profile-info-modal.component.html',
  styleUrls: ['profile-info-modal.component.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileInfoModalComponent {
  @Input() topic: ProfileInfoTopic = 'activity';

  readonly activityLevels = ACTIVITY_LEVELS;

  readonly experienceLevels: readonly ExperienceInfo[] = EXPERIENCE_COPY.map(copy => {
    const m = MALE_THRESHOLDS[copy.key];
    const f = FEMALE_THRESHOLDS[copy.key];
    return {
      ...copy,
      lossMen: `${fmt(m.maxLossRatePct * IDEAL_LOSS_FLOOR_RATIO)}–${fmt(m.maxLossRatePct)}`,
      lossWomen: `${fmt(f.maxLossRatePct * IDEAL_LOSS_FLOOR_RATIO)}–${fmt(f.maxLossRatePct)}`,
      gainMen: `${fmt(m.idealGainFloorPct)}–${fmt(m.idealGainCeilingPct)}`,
      gainWomen: `${fmt(f.idealGainFloorPct)}–${fmt(f.idealGainCeilingPct)}`,
      deficitMen: m.deficitStep,
      deficitWomen: f.deficitStep,
      surplusMen: m.surplusStep,
      surplusWomen: f.surplusStep,
    };
  });

  readonly lowActivityCap = LOW_ACTIVITY_STEP_CAP;
  readonly highDeficitMin = HIGH_ACTIVITY_DEFICIT_STEP_MIN;
  readonly highSurplusMin = HIGH_ACTIVITY_SURPLUS_STEP_MIN;
  readonly seniorAge = SENIOR_AGE;
  readonly seniorMaxLoss = SENIOR_MAX_LOSS_RATE_PCT;
  readonly seniorDeficitCap = SENIOR_DEFICIT_STEP_CAP;
}
