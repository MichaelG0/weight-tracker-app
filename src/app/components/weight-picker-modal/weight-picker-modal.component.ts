import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Input,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { IonButton, IonButtons, IonHeader, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { DatabaseService } from 'src/app/services/database.service';

const ITEM_HEIGHT = 44;

@Component({
  selector: 'app-weight-picker-modal',
  templateUrl: './weight-picker-modal.component.html',
  styleUrls: ['./weight-picker-modal.component.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonButton, IonButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightPickerModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly db = inject(DatabaseService);

  @Input() value: number | null = null;

  @ViewChild('wholeCol') wholeCol!: ElementRef<HTMLElement>;
  @ViewChild('fractionCol') fractionCol!: ElementRef<HTMLElement>;

  readonly unit = this.db.weightUnit;
  // Stones are shown to two decimals (e.g. 12.05 st); kg and lbs to one.
  private readonly fractionDigits = this.db.weightUnit() === 'st' ? 2 : 1;
  private readonly fractionScale = 10 ** this.fractionDigits;
  private readonly wholeMax = this.db.weightUnit() === 'lbs' ? 2999 : this.db.weightUnit() === 'st' ? 199 : 999;
  readonly wholeOptions = Array.from({ length: this.wholeMax + 1 }, (_, i) => i);
  readonly fractionOptions = Array.from({ length: this.fractionScale }, (_, i) =>
    String(i).padStart(this.fractionDigits, '0'),
  );

  readonly whole = signal(0);
  readonly fraction = signal(0);
  readonly weight = computed(() => (this.whole() * this.fractionScale + this.fraction()) / this.fractionScale);

  ngOnInit(): void {
    const scaled = Math.round((this.value ?? 0) * this.fractionScale);
    this.whole.set(Math.min(Math.floor(scaled / this.fractionScale), this.wholeMax));
    this.fraction.set(scaled % this.fractionScale);
  }

  ionViewDidEnter(): void {
    this.wholeCol.nativeElement.scrollTop = this.whole() * ITEM_HEIGHT;
    this.fractionCol.nativeElement.scrollTop = this.fraction() * ITEM_HEIGHT;
  }

  onWholeScroll(event: Event): void {
    this.whole.set(this.indexFromScroll(event.target as HTMLElement, this.wholeMax));
  }

  onFractionScroll(event: Event): void {
    this.fraction.set(this.indexFromScroll(event.target as HTMLElement, this.fractionScale - 1));
  }

  selectWhole(index: number): void {
    this.whole.set(index);
    this.wholeCol.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
  }

  selectFraction(index: number): void {
    this.fraction.set(index);
    this.fractionCol.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
  }

  confirm(): void {
    this.modalCtrl.dismiss(this.weight(), 'confirm');
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  private indexFromScroll(el: HTMLElement, max: number): number {
    return Math.min(Math.max(Math.round(el.scrollTop / ITEM_HEIGHT), 0), max);
  }
}
