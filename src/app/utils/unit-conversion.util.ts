import { WeightUnit, HeightFtIn, WeightDisplay, WeightPart } from "../services/database.service";

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

// For UI display - returns a decimal value for all unit types, without unit labels
export function formatWeightDecimal(value: number, unit: WeightUnit, toFixedOffset: number = 0): string {
  return value.toFixed((unit === 'st' ? STONE_DECIMALS : DEFAULT_DECIMALS) + toFixedOffset);
}

// For UI display - formats stone units like "X st Y lbs" and other units like "X kg" or "X lbs"
// `parts` lets each unit label be styled separately; `text` is the plain string including units
export function formatWeight(value: number, unit: WeightUnit, toFixedOffset: number = 0): WeightDisplay {
  const decimals = DEFAULT_DECIMALS + toFixedOffset;
  let parts: WeightPart[];

  if (unit === 'st') {
    const totalPounds = Math.abs(value) * 14;
    let stones = Math.floor(totalPounds / 14);
    let pounds = parseFloat((totalPounds - stones * 14).toFixed(decimals));
    if (pounds >= 14) {
      stones += 1;
      pounds = 0;
    }
    const sign = value < 0 && (stones > 0 || pounds > 0) ? '-' : '';
    parts = [
      { value: `${sign}${stones}`, unit: 'st' },
      { value: pounds.toFixed(decimals), unit: 'lbs' },
    ];
  } else {
    parts = [{ value: value.toFixed(decimals), unit }];
  }

  const text = parts.map(p => `${p.value} ${p.unit}`).join(' ');
  return { parts, text };
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
