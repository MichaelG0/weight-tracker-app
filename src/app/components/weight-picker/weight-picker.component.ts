import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { DatabaseService } from 'src/app/services/database.service';

const ITEM_HEIGHT = 44;

@Component({
  selector: 'app-weight-picker',
  templateUrl: './weight-picker.component.html',
  styleUrls: ['./weight-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightPickerComponent implements OnChanges {
  private readonly db = inject(DatabaseService);

  @Input() value: number | null = null;
  @Output() weightChange = new EventEmitter<number>();

  @ViewChild('wholeCol') wholeCol?: ElementRef<HTMLElement>;
  @ViewChild('fractionCol') fractionCol?: ElementRef<HTMLElement>;

  readonly unit = this.db.weightUnit;
  // Stones are shown to two decimals (e.g. 12.05 st); kg and lbs to one.
  private readonly fractionDigits = this.db.weightUnit() === 'st' ? 2 : 1;
  private readonly fractionScale = 10 ** this.fractionDigits;
  private readonly wholeMax = this.db.weightUnit() === 'lbs' ? 2999 : this.db.weightUnit() === 'st' ? 199 : 999;
  readonly wholeOptions = Array.from({ length: this.wholeMax + 1 }, (_, i) => i);
  readonly fractionOptions = Array.from({ length: this.fractionScale }, (_, i) => String(i).padStart(this.fractionDigits, '0'));

  readonly whole = signal(0);
  readonly fraction = signal(0);
  private readonly scaled = computed(() => this.whole() * this.fractionScale + this.fraction());
  readonly weight = computed(() => this.scaled() / this.fractionScale);

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['value']) return;
    const next = Math.round((this.value ?? 0) * this.fractionScale);
    if (next === this.scaled()) return;
    this.whole.set(Math.min(Math.floor(next / this.fractionScale), this.wholeMax));
    this.fraction.set(next % this.fractionScale);
    this.scrollToValue();
  }

  // Wheels can only be scrolled once rendered, so the host calls this when it becomes visible.
  scrollToValue(): void {
    if (!this.wholeCol || !this.fractionCol) return;
    this.wholeCol.nativeElement.scrollTop = this.whole() * ITEM_HEIGHT;
    this.fractionCol.nativeElement.scrollTop = this.fraction() * ITEM_HEIGHT;
  }

  onWholeScroll(event: Event): void {
    this.setWhole(this.indexFromScroll(event.target as HTMLElement, this.wholeMax));
  }

  onFractionScroll(event: Event): void {
    this.setFraction(this.indexFromScroll(event.target as HTMLElement, this.fractionScale - 1));
  }

  selectWhole(index: number): void {
    this.setWhole(index);
    this.wholeCol?.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
  }

  selectFraction(index: number): void {
    this.setFraction(index);
    this.fractionCol?.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
  }

  private setWhole(index: number): void {
    if (index === this.whole()) return;
    this.whole.set(index);
    this.weightChange.emit(this.weight());
  }

  private setFraction(index: number): void {
    if (index === this.fraction()) return;
    this.fraction.set(index);
    this.weightChange.emit(this.weight());
  }

  private indexFromScroll(el: HTMLElement, max: number): number {
    return Math.min(Math.max(Math.round(el.scrollTop / ITEM_HEIGHT), 0), max);
  }
}
