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

const ITEM_HEIGHT = 44;
const WHOLE_MAX = 9;
const HUNDREDTHS_MAX = 99;

@Component({
  selector: 'app-rate-picker-modal',
  templateUrl: './rate-picker-modal.component.html',
  styleUrls: ['./rate-picker-modal.component.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonButton, IonButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatePickerModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);

  @Input() value: number | null = null;

  @ViewChild('wholeCol') wholeCol!: ElementRef<HTMLElement>;
  @ViewChild('hundredthCol') hundredthCol!: ElementRef<HTMLElement>;

  readonly unit = '%/week';
  readonly wholeOptions = Array.from({ length: WHOLE_MAX + 1 }, (_, i) => i);
  readonly hundredthOptions = Array.from({ length: HUNDREDTHS_MAX + 1 }, (_, i) => String(i).padStart(2, '0'));

  readonly whole = signal(0);
  readonly hundredth = signal(0);
  readonly rate = computed(() => (this.whole() * 100 + this.hundredth()) / 100);

  ngOnInit(): void {
    const hundredths = Math.round((this.value ?? 0) * 100);
    this.whole.set(Math.min(Math.floor(hundredths / 100), WHOLE_MAX));
    this.hundredth.set(hundredths % 100);
  }

  ionViewDidEnter(): void {
    this.wholeCol.nativeElement.scrollTop = this.whole() * ITEM_HEIGHT;
    this.hundredthCol.nativeElement.scrollTop = this.hundredth() * ITEM_HEIGHT;
  }

  onWholeScroll(event: Event): void {
    this.whole.set(this.indexFromScroll(event.target as HTMLElement, WHOLE_MAX));
  }

  onHundredthScroll(event: Event): void {
    this.hundredth.set(this.indexFromScroll(event.target as HTMLElement, HUNDREDTHS_MAX));
  }

  selectWhole(index: number): void {
    this.whole.set(index);
    this.wholeCol.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
  }

  selectHundredth(index: number): void {
    this.hundredth.set(index);
    this.hundredthCol.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
  }

  confirm(): void {
    this.modalCtrl.dismiss(this.rate(), 'confirm');
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  private indexFromScroll(el: HTMLElement, max: number): number {
    return Math.min(Math.max(Math.round(el.scrollTop / ITEM_HEIGHT), 0), max);
  }
}
