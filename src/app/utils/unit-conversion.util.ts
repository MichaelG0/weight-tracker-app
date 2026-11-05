import { WeightUnit, HeightFtIn } from "../services/database.service";

const DEFAULT_DECIMALS = 1;
const STONE_DECIMALS = 2;

export function kgToUnitFixed(kg: number, unit: WeightUnit): number {
  switch (unit) {
    case 'lbs': return parseFloat((kg * 2.20462).toFixed(DEFAULT_DECIMALS));
    case 'st': return parseFloat((kg * 0.157473).toFixed(STONE_DECIMALS));
    default: return parseFloat(kg.toFixed(DEFAULT_DECIMALS));
  }
}

// For precise calculations
export function kgToUnit(kg: number, unit: WeightUnit): number {
  switch (unit) {
    case 'lbs': return kg * 2.20462;
    case 'st': return kg * 0.157473;
    default: return kg;
  }
}

// For db saves
export function unitToKgFixed(value: number, unit: WeightUnit): number {
  switch (unit) {
    case 'lbs': return parseFloat((value / 2.20462).toFixed(DEFAULT_DECIMALS));
    case 'st': return parseFloat((value / 0.157473).toFixed(DEFAULT_DECIMALS));
    default: return parseFloat(value.toFixed(DEFAULT_DECIMALS));
  }
}

export function roundWeightNum(value: number, unit: WeightUnit, toFixedOffset: number = 0): number {
  return parseFloat(formatWeightDecimal(value, unit, toFixedOffset));
}

// For UI display - returns a decimal value for all unit types
export function formatWeightDecimal(value: number, unit: WeightUnit, toFixedOffset: number = 0): string {
  return value.toFixed((unit === 'st' ? STONE_DECIMALS : DEFAULT_DECIMALS) + toFixedOffset);
}

// For UI display - returns a string like "X st Y lbs" for stone units and a decimal string for other units
export function formatWeight(value: number, unit: WeightUnit, toFixedOffset: number = 0): string {
  switch (unit) {
    case 'st':
      const decimals = DEFAULT_DECIMALS + toFixedOffset;
      const totalPounds = Math.abs(value) * 14;
      let stones = Math.floor(totalPounds / 14);
      let pounds = parseFloat((totalPounds - stones * 14).toFixed(decimals));
      if (pounds >= 14) {
        stones += 1;
        pounds = 0;
      }
      const sign = value < 0 && (stones > 0 || pounds > 0) ? '-' : '';
      return `${sign}${stones} st ${pounds.toFixed(decimals)} lbs`;
    default:
      return value.toFixed(DEFAULT_DECIMALS + toFixedOffset);
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
