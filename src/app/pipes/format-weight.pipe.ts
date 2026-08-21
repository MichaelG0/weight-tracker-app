import { Pipe, PipeTransform } from '@angular/core';
import { WeightUnit } from '../services/database.service';
import { formatWeight } from '../utils/unit-conversion.util';

@Pipe({
  name: 'formatWeight',
})
export class FormatWeightPipe implements PipeTransform {
  transform(value: number | null | undefined, unit: WeightUnit = 'kg'): string {
    if (value == null) return '--';
    return formatWeight(value, unit);
  }
}
