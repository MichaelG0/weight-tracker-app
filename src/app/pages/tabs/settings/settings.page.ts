import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonToggle,
  IonIcon,
  IonModal,
  IonDatetime,
  IonChip,
  IonButton,
  IonRouterLink,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { CssThemeService } from '../../../services/css-theme.service';
import { DatabaseService, UserSettingsDB, WeightUnit, HeightUnit, ActivityLevel, Experience } from '../../../services/database.service';
import { addIcons } from 'ionicons';
import {
  personOutline,
  moonOutline,
  maleFemaleOutline,
  calendarOutline,
  resizeOutline,
  saveOutline,
  checkmarkCircleOutline,
  barbellOutline,
  walkOutline,
  fitnessOutline,
  informationCircleOutline,
  swapVerticalOutline,
  downloadOutline,
  cloudUploadOutline,
  trashOutline,
} from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { take } from 'rxjs/operators';
import { FormatHeightPipe } from '../../../pipes/format-height.pipe';
import { HeightPickerModalComponent } from 'src/app/components/height-picker-modal/height-picker-modal.component';
import { toDateKey, todayLocalMidnightString } from 'src/app/utils/date-converter.util';
import { weightLogsToCsv } from 'src/app/utils/weight-log-csv.util';
import { ProfileInfoModalComponent, ProfileInfoTopic } from 'src/app/components/profile-info-modal/profile-info-modal.component';
import { DeleteWeightLogsModalComponent } from 'src/app/components/delete-weight-logs-modal/delete-weight-logs-modal.component';
import { FormatDatePipe } from '../../../pipes/format-date.pipe';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonToggle,
    IonIcon,
    IonModal,
    IonDatetime,
    IonChip,
    IonButton,
    GlassHeaderBackdropDirective,
    FormatDatePipe,
    FormatHeightPipe,
    RouterLink,
    IonRouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private themeService = inject(CssThemeService);
  private db = inject(DatabaseService);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private cdr = inject(ChangeDetectorRef);
  private toastCtrl = inject(ToastController);

  name = this.db.settings()?.name ?? '';
  birthDate = this.db.settings()?.birthDate ?? '';
  gender = this.db.settings()?.gender ?? '';
  heightCm: number | null = this.db.settings()?.heightCm ?? null;
  weightUnit: WeightUnit = this.db.settings()?.weightUnit ?? 'kg';
  heightUnit: HeightUnit = this.db.settings()?.heightUnit ?? 'cm';
  activityLevel: ActivityLevel | '' = this.db.settings()?.activityLevel ?? '';
  experience: Experience | '' = this.db.settings()?.experience ?? '';

  readonly activityLevels: ActivityLevel[] = ['Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Extra Active'];
  readonly experienceLevels: Experience[] = ['Beginner', 'Intermediate', 'Advanced'];
  readonly maxBirthDate = todayLocalMidnightString();

  constructor() {
    addIcons({
      personOutline,
      moonOutline,
      maleFemaleOutline,
      calendarOutline,
      resizeOutline,
      saveOutline,
      checkmarkCircleOutline,
      barbellOutline,
      walkOutline,
      fitnessOutline,
      informationCircleOutline,
      swapVerticalOutline,
      downloadOutline,
      cloudUploadOutline,
      trashOutline,
    });
  }

  toggleTheme(event: any): void {
    this.themeService.toggleTheme(event.detail.checked);
  }

  isDarkMode(): boolean {
    return this.themeService.isDarkMode();
  }

  saveSettings(): void {
    const settings: Omit<UserSettingsDB, 'user_id'> = {
      name: this.name || undefined,
      birth_date: this.birthDate || undefined,
      gender: this.gender || undefined,
      weight_unit: this.weightUnit,
      height_unit: this.heightUnit,
      activity_level: this.activityLevel || undefined,
      experience: this.experience || undefined,
    };

    if (this.heightCm) {
      settings.height_cm = this.heightCm;
    }

    this.db.saveSettings(settings).pipe(take(1)).subscribe();
  }

  onBirthDateChange(event: CustomEvent): void {
    const value = event.detail.value;
    this.birthDate = typeof value === 'string' ? value.substring(0, 10) : '';
    this.saveSettings();
  }

  async editName(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Name',
      inputs: [{ name: 'name', type: 'text', placeholder: 'Enter your name', value: this.name }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Done',
          handler: (data: { name?: string }) => {
            this.name = (data.name ?? '').trim();
            this.saveSettings();
            this.cdr.markForCheck();
          },
        },
      ],
    });
    await alert.present();
  }

  async openHeightPicker(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: HeightPickerModalComponent,
      componentProps: { value: this.heightCm, unit: this.heightUnit },
      cssClass: 'height-picker-modal',
    });
    await modal.present();

    const { data, role } = await modal.onDidDismiss<number | null>();
    if (role !== 'confirm' || data == null) return;

    this.heightCm = data;
    this.saveSettings();
    this.cdr.markForCheck();
  }

  setGender(value: string): void {
    this.gender = value;
    this.saveSettings();
  }

  setWeightUnit(value: WeightUnit): void {
    this.weightUnit = value;
    this.saveSettings();
  }

  setHeightUnit(value: HeightUnit): void {
    this.heightUnit = value;
    this.saveSettings();
  }

  setActivityLevel(value: ActivityLevel): void {
    this.activityLevel = this.activityLevel === value ? '' : value;
    this.saveSettings();
  }

  setExperience(value: Experience): void {
    this.experience = this.experience === value ? '' : value;
    this.saveSettings();
  }

  async showInfo(topic: ProfileInfoTopic): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ProfileInfoModalComponent,
      componentProps: { topic },
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  async exportWeightLogs(): Promise<void> {
    const entries = this.db.entries();
    if (!entries.length) {
      this.showToast('No weight logs to export');
      return;
    }

    const csv = weightLogsToCsv(entries, this.db.weightUnit());
    const fileName = `weight-logs-${toDateKey(new Date())}.csv`;

    if (!Capacitor.isNativePlatform()) {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url));
      return;
    }

    try {
      const { uri } = await Filesystem.writeFile({
        path: fileName,
        data: csv,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: fileName, files: [uri], dialogTitle: 'Export weight logs' });
    } catch {
      this.showToast('Could not export weight logs');
    }
  }

  async openDeleteWeightLogs(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: DeleteWeightLogsModalComponent,
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });
    await modal.present();

    const { data, role } = await modal.onDidDismiss<number>();
    if (role !== 'deleted' || data == null) return;
    this.showToast(`${data} weight ${data === 1 ? 'log' : 'logs'} deleted`);
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3000, position: 'bottom', swipeGesture: 'vertical' });
    await toast.present();
  }
}
