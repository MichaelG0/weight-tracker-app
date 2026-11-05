import { Pipe, PipeTransform } from '@angular/core';
import { WeightPart, WeightUnit } from '../services/database.service';
import { formatWeight } from '../utils/unit-conversion.util';

@Pipe({
  name: 'formatWeightParts',
})
export class FormatWeightPartsPipe implements PipeTransform {
  transform(value: number | null | undefined, unit: WeightUnit = 'kg', toFixedOffset: number = 0): WeightPart[] {
    if (value == null) return [];
    return formatWeight(value, unit, toFixedOffset).parts;
  }
}
