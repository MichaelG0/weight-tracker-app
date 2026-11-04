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
const WHOLE_MAX = 999;
const TENTH_MAX = 9;

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
  @ViewChild('tenthCol') tenthCol!: ElementRef<HTMLElement>;

  readonly unit = this.db.weightUnit;
  readonly wholeOptions = Array.from({ length: WHOLE_MAX + 1 }, (_, i) => i);
  readonly tenthOptions = Array.from({ length: TENTH_MAX + 1 }, (_, i) => i);

  readonly whole = signal(0);
  readonly tenth = signal(0);
  readonly weight = computed(() => (this.whole() * 10 + this.tenth()) / 10);

  ngOnInit(): void {
    const tenths = Math.round((this.value ?? 0) * 10);
    this.whole.set(Math.min(Math.floor(tenths / 10), WHOLE_MAX));
    this.tenth.set(tenths % 10);
  }

  ionViewDidEnter(): void {
    this.wholeCol.nativeElement.scrollTop = this.whole() * ITEM_HEIGHT;
    this.tenthCol.nativeElement.scrollTop = this.tenth() * ITEM_HEIGHT;
  }

  onWholeScroll(event: Event): void {
    this.whole.set(this.indexFromScroll(event.target as HTMLElement, WHOLE_MAX));
  }

  onTenthScroll(event: Event): void {
    this.tenth.set(this.indexFromScroll(event.target as HTMLElement, TENTH_MAX));
  }

  selectWhole(index: number): void {
    this.whole.set(index);
    this.wholeCol.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
  }

  selectTenth(index: number): void {
    this.tenth.set(index);
    this.tenthCol.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
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
