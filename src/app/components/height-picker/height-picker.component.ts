import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { HeightUnit } from 'src/app/services/database.service';
import { cmToFtIn, ftInToCm } from 'src/app/utils/unit-conversion.util';

const ITEM_HEIGHT = 44;
const CM_MIN = 0;
const CM_MAX = 499;
const FEET_MAX = 19;
const INCHES_PER_FOOT = 12;
const DEFAULT_CM = 170;

@Component({
  selector: 'app-height-picker',
  templateUrl: './height-picker.component.html',
  styleUrls: ['./height-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeightPickerComponent implements OnChanges {
  // Height is always exchanged in cm, whatever the unit shown by the wheels.
  @Input() value: number | null = null;
  @Input() unit: HeightUnit = 'cm';
  @Output() heightChange = new EventEmitter<number>();

  @ViewChild('primaryCol') primaryCol?: ElementRef<HTMLElement>;
  @ViewChild('secondaryCol') secondaryCol?: ElementRef<HTMLElement>;

  primaryOptions: number[] = [];
  readonly secondaryOptions = Array.from({ length: INCHES_PER_FOOT }, (_, i) => i);

  // cm in cm mode, feet in ft/in mode
  readonly primary = signal(DEFAULT_CM);
  // inches in ft/in mode
  readonly secondary = signal(0);
  readonly height = computed(() => (this.isFtIn ? ftInToCm({ feet: this.primary(), inches: this.secondary() }) : this.primary()));

  get isFtIn(): boolean {
    return this.unit === 'ft/in';
  }

  private get primaryMin(): number {
    return this.isFtIn ? 0 : CM_MIN;
  }

  private get primaryMax(): number {
    return this.isFtIn ? FEET_MAX : CM_MAX;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['value'] && !changes['unit']) return;

    this.primaryOptions = Array.from({ length: this.primaryMax - this.primaryMin + 1 }, (_, i) => this.primaryMin + i);
    const cm = this.value || DEFAULT_CM;

    if (this.isFtIn) {
      const { feet, inches } = cmToFtIn(cm);
      this.primary.set(Math.min(feet ?? 0, FEET_MAX));
      this.secondary.set(inches ?? 0);
    } else {
      this.primary.set(Math.min(Math.max(Math.round(cm), CM_MIN), CM_MAX));
      this.secondary.set(0);
    }
    this.scrollToValue();
  }

  // Wheels can only be scrolled once rendered, so the host calls this when it becomes visible.
  scrollToValue(): void {
    if (!this.primaryCol) return;
    this.primaryCol.nativeElement.scrollTop = (this.primary() - this.primaryMin) * ITEM_HEIGHT;
    if (this.secondaryCol) this.secondaryCol.nativeElement.scrollTop = this.secondary() * ITEM_HEIGHT;
  }

  onPrimaryScroll(event: Event): void {
    this.setPrimary(this.primaryMin + this.indexFromScroll(event.target as HTMLElement, this.primaryMax - this.primaryMin));
  }

  onSecondaryScroll(event: Event): void {
    this.setSecondary(this.indexFromScroll(event.target as HTMLElement, INCHES_PER_FOOT - 1));
  }

  selectPrimary(value: number): void {
    this.setPrimary(value);
    this.primaryCol?.nativeElement.scrollTo({ top: (value - this.primaryMin) * ITEM_HEIGHT, behavior: 'smooth' });
  }

  selectSecondary(value: number): void {
    this.setSecondary(value);
    this.secondaryCol?.nativeElement.scrollTo({ top: value * ITEM_HEIGHT, behavior: 'smooth' });
  }

  private setPrimary(value: number): void {
    if (value === this.primary()) return;
    this.primary.set(value);
    this.heightChange.emit(this.height());
  }

  private setSecondary(value: number): void {
    if (value === this.secondary()) return;
    this.secondary.set(value);
    this.heightChange.emit(this.height());
  }

  private indexFromScroll(el: HTMLElement, max: number): number {
    return Math.min(Math.max(Math.round(el.scrollTop / ITEM_HEIGHT), 0), max);
  }
}
