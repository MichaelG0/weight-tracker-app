import type { Goal } from 'src/app/services/database.service';

/** Weekly rate (% of start weight) implied by a goal's weights and dates. Null when there is no rate (e.g. maintenance). */
export function goalRatePct(goal: Pick<Goal, 'startWeight' | 'goalWeight' | 'startDateMs' | 'goalDateMs'>): number | null {
  if (!goal.startWeight) return null;
  const weeks = (goal.goalDateMs - goal.startDateMs) / (7 * 86400000);
  const totalChange = Math.abs(goal.goalWeight - goal.startWeight);
  if (weeks <= 0 || totalChange === 0) return null;
  return (totalChange / weeks / goal.startWeight) * 100;
}
