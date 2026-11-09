import { WeightUnit, HeightUnit, HeightFtIn, WeightDisplay, WeightPart } from "../services/database.service";

const DEFAULT_DECIMALS = 1;
const STONE_DECIMALS = 2;

export function kgToUnitFixed(kg: number, unit: WeightUnit): number {
  let result: number;
  switch (unit) {
    case 'lbs': result = parseFloat((kg * 2.20462).toFixed(DEFAULT_DECIMALS)); break;
    case 'st': result = parseFloat((kg * 0.157473).toFixed(STONE_DECIMALS)); break;
    default: result = parseFloat(kg.toFixed(DEFAULT_DECIMALS));
  }
  console.log('kgToUnitFixed returned:', result);
  return result;
}

// For precise calculations
export function kgToUnit(kg: number, unit: WeightUnit): number {
  let result: number;
  switch (unit) {
    case 'lbs': result = kg * 2.20462; break;
    case 'st': result = kg * 0.157473; break;
    default: result = kg;
  }
  console.log('kgToUnit returned:', result);
  return result;
}

// For db saves - lbs/st are not rounded, so converting back to the display unit returns the same value
export function unitToKg(value: number, unit: WeightUnit): number {
  let result: number;
  switch (unit) {
    case 'lbs': result = value / 2.20462; break;
    case 'st': result = value / 0.157473; break;
    default: result = parseFloat(value.toFixed(DEFAULT_DECIMALS));
  }
  console.log('unitToKg returned:', result);
  return result;
}

export function roundWeightNum(value: number, unit: WeightUnit, toFixedOffset: number = 0): number {
  const result = parseFloat(formatWeightDecimal(value, unit, toFixedOffset));
  console.log('roundWeightNum returned:', result);
  return result;
}

// For UI display - returns a decimal value for all unit types, without unit labels
export function formatWeightDecimal(value: number, unit: WeightUnit, toFixedOffset: number = 0): string {
  const result = value.toFixed((unit === 'st' ? STONE_DECIMALS : DEFAULT_DECIMALS) + toFixedOffset);
  console.log('formatWeightDecimal returned:', result);
  return result;
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
  const result: WeightDisplay = { parts, text };
  console.log('formatWeight returned:', result);
  return result;
}

export function cmToFtIn(cm: number): HeightFtIn {
  let result: HeightFtIn;
  if (!cm) {
    result = { feet: 0, inches: 0 };
  } else {
    const totalInches = Math.round(cm / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    result = { feet, inches };
  }
  console.log('cmToFtIn returned:', result);
  return result;
}

export function ftInToCm(value: HeightFtIn): number {
  let result: number;
  if (!value || (!value.feet && !value.inches)) {
    result = 0;
  } else {
    const totalInches = (value.feet ?? 0) * 12 + (value.inches ?? 0);
    const cm = totalInches * 2.54;
    result = parseFloat(cm.toFixed(0));
  }
  console.log('ftInToCm returned:', result);
  return result;
}

export function formatHeight(cm: number | null | undefined, unit: HeightUnit): string {
  let result: string;
  if (!cm) {
    result = '';
  } else if (unit === 'cm') {
    result = `${Math.round(cm)} cm`;
  } else {
    const { feet, inches } = cmToFtIn(cm);
    result = `${feet} ft ${inches} in`;
  }
  console.log('formatHeight returned:', result);
  return result;
}
