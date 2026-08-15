import { HeightUnit, WeightUnit, HeightFtIn } from "../services/database.service";

export function kgToUnit(kg: number, unit: WeightUnit): number {
  switch (unit) {
    case 'lbs': return parseFloat((kg * 2.20462).toFixed(1));
    case 'st': return parseFloat((kg * 0.157473).toFixed(2));
    default: return parseFloat(kg.toFixed(1));
  }
}

export function kgToUnitNoFixed(kg: number, unit: WeightUnit): number {
  switch (unit) {
    case 'lbs': return kg * 2.20462;
    case 'st': return kg * 0.157473;
    default: return kg;
  }
}

export function unitToKg(value: number, unit: WeightUnit): number {
  switch (unit) {
    case 'lbs': return parseFloat((value / 2.20462).toFixed(1));
    case 'st': return parseFloat((value / 0.157473).toFixed(1));
    default: return parseFloat(value.toFixed(1));
  }
}

export function formatWeight(value: number, unit: WeightUnit): number {
  switch (unit) {
    case 'st':
      return parseFloat(value.toFixed(2));
    default:
      return parseFloat(value.toFixed(1));
  }
}

export function cmToFtIn(cm: number): HeightFtIn {
  if (!cm) return { feet: 0, inches: 0 };
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

export function ftInToCm(value: HeightFtIn): number {
  if (!value || (!value.feet && !value.inches)) return 0;
  const totalInches = (value.feet ?? 0) * 12 + (value.inches ?? 0);
  const cm = totalInches * 2.54;
  return parseFloat(cm.toFixed(0));
}
