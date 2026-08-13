import { WeightUnit } from "../services/database.service";

export function kgToUnit(kg: number, unit: WeightUnit): number {
  switch (unit) {
    case 'lbs': return parseFloat((kg * 2.20462).toFixed(1));
    case 'st': return parseFloat((kg * 0.157473).toFixed(2));
    default: return parseFloat(kg.toFixed(1));
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
