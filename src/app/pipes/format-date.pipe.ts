import { Pipe, PipeTransform } from '@angular/core';
import { todayLocalMidnightDate } from '../utils/date-converter.util';

@Pipe({
  name: 'formatDate',
})
export class FormatDatePipe implements PipeTransform {
  transform(value: string | number | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
    if (!value) return '';

    const date = new Date(value);

    // Check for invalid dates
    if (isNaN(date.getTime())) return '';

    // Standard smart logic: Show Month and Day by default.
    // Only append the Year if it's not the current year.
    let finalOptions: Intl.DateTimeFormatOptions = options || {
      month: 'short',
      day: 'numeric',
    };

    if (!options && date.getFullYear() !== todayLocalMidnightDate().getFullYear()) {
      finalOptions = { ...finalOptions, year: 'numeric' };
    }

    // Pass undefined as the locale to let the browser automatically format it based on the user's device!
    return date.toLocaleDateString(undefined, finalOptions);
  }
}
