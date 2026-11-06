import { Pipe, PipeTransform } from '@angular/core';
import { HeightUnit } from '../services/database.service';
import { formatHeight } from '../utils/unit-conversion.util';

@Pipe({
  name: 'formatHeight',
})
export class FormatHeightPipe implements PipeTransform {
  transform(value: number | null | undefined, unit: HeightUnit = 'cm'): string {
    return formatHeight(value, unit);
  }
}
