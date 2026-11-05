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
const LBS_PER_STONE = 14;

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
  @ViewChild('poundsCol') poundsCol?: ElementRef<HTMLElement>;
  @ViewChild('fractionCol') fractionCol?: ElementRef<HTMLElement>;

  readonly unit = this.db.weightUnit;
  readonly isStone = this.db.weightUnit() === 'st';
  // Stones are picked as stones + pounds (whole and tenths); the emitted value is still decimal stones.
  private readonly fractionDigits = 1;
  private readonly fractionScale = 10 ** this.fractionDigits;
  private readonly totalScale = this.isStone ? LBS_PER_STONE * this.fractionScale : this.fractionScale;
  private readonly wholeMax = this.db.weightUnit() === 'lbs' ? 2999 : this.isStone ? 199 : 999;
  readonly wholeOptions = Array.from({ length: this.wholeMax + 1 }, (_, i) => i);
  readonly poundsOptions = Array.from({ length: LBS_PER_STONE }, (_, i) => i);
  readonly fractionOptions = Array.from({ length: this.fractionScale }, (_, i) => String(i).padStart(this.fractionDigits, '0'));

  readonly whole = signal(0);
  readonly pounds = signal(0);
  readonly fraction = signal(0);
  private readonly scaled = computed(() => (this.whole() * (this.isStone ? LBS_PER_STONE : 1) + this.pounds()) * this.fractionScale + this.fraction());
  readonly weight = computed(() => this.scaled() / this.totalScale);

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['value']) return;
    const next = Math.round((this.value ?? 0) * this.totalScale);
    if (next === this.scaled()) return;
    if (this.isStone) {
      const tenthsOfPound = next % this.totalScale;
      this.whole.set(Math.min(Math.floor(next / this.totalScale), this.wholeMax));
      this.pounds.set(Math.floor(tenthsOfPound / this.fractionScale));
      this.fraction.set(tenthsOfPound % this.fractionScale);
    } else {
      this.whole.set(Math.min(Math.floor(next / this.fractionScale), this.wholeMax));
      this.fraction.set(next % this.fractionScale);
    }
    this.scrollToValue();
  }

  // Wheels can only be scrolled once rendered, so the host calls this when it becomes visible.
  scrollToValue(): void {
    if (!this.wholeCol || !this.fractionCol) return;
    this.wholeCol.nativeElement.scrollTop = this.whole() * ITEM_HEIGHT;
    this.fractionCol.nativeElement.scrollTop = this.fraction() * ITEM_HEIGHT;
    if (this.poundsCol) this.poundsCol.nativeElement.scrollTop = this.pounds() * ITEM_HEIGHT;
  }

  onWholeScroll(event: Event): void {
    this.setWhole(this.indexFromScroll(event.target as HTMLElement, this.wholeMax));
  }

  onPoundsScroll(event: Event): void {
    this.setPounds(this.indexFromScroll(event.target as HTMLElement, LBS_PER_STONE - 1));
  }

  onFractionScroll(event: Event): void {
    this.setFraction(this.indexFromScroll(event.target as HTMLElement, this.fractionScale - 1));
  }

  selectWhole(index: number): void {
    this.setWhole(index);
    this.wholeCol?.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
  }

  selectPounds(index: number): void {
    this.setPounds(index);
    this.poundsCol?.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
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

  private setPounds(index: number): void {
    if (index === this.pounds()) return;
    this.pounds.set(index);
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
