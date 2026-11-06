import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  IonInput,
  IonModal,
  IonDatetime,
  IonChip,
  IonButton,
  ModalController,
} from '@ionic/angular/standalone';
import { CssThemeService } from '../../../services/css-theme.service';
import {
  DatabaseService,
  UserSettingsDB,
  WeightUnit,
  HeightUnit,
  ActivityLevel,
  Experience,
  BodyType,
} from '../../../services/database.service';
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
  bodyOutline,
  walkOutline,
  fitnessOutline,
  informationCircleOutline,
  swapVerticalOutline,
} from 'ionicons/icons';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { take } from 'rxjs/operators';
import { FormatHeightPipe } from '../../../pipes/format-height.pipe';
import { HeightPickerModalComponent } from 'src/app/components/height-picker-modal/height-picker-modal.component';
import { todayLocalMidnightString } from 'src/app/utils/date-converter.util';
import { ProfileInfoModalComponent, ProfileInfoTopic } from 'src/app/components/profile-info-modal/profile-info-modal.component';
import { FormatDatePipe } from '../../../pipes/format-date.pipe';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonToggle,
    IonIcon,
    IonInput,
    IonModal,
    IonDatetime,
    IonChip,
    IonButton,
    GlassHeaderBackdropDirective,
    FormatDatePipe,
    FormatHeightPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private themeService = inject(CssThemeService);
  private db = inject(DatabaseService);
  private modalCtrl = inject(ModalController);
  private cdr = inject(ChangeDetectorRef);

  name = this.db.settings()?.name ?? '';
  birthDate = this.db.settings()?.birthDate ?? '';
  gender = this.db.settings()?.gender ?? '';
  heightCm: number | null = this.db.settings()?.heightCm ?? null;
  weightUnit: WeightUnit = this.db.settings()?.weightUnit ?? 'kg';
  heightUnit: HeightUnit = this.db.settings()?.heightUnit ?? 'cm';
  activityLevel: ActivityLevel | '' = this.db.settings()?.activityLevel ?? '';
  experience: Experience | '' = this.db.settings()?.experience ?? '';
  bodyType: BodyType | '' = this.db.settings()?.bodyType ?? '';

  readonly activityLevels: ActivityLevel[] = ['Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Extra Active'];
  readonly experienceLevels: Experience[] = ['Beginner', 'Intermediate', 'Advanced'];
  readonly bodyTypes: BodyType[] = ['Ectomorph', 'Mesomorph', 'Endomorph'];
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
      bodyOutline,
      walkOutline,
      fitnessOutline,
      informationCircleOutline,
      swapVerticalOutline,
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
      body_type: this.bodyType || undefined,
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

  setBodyType(value: BodyType): void {
    this.bodyType = this.bodyType === value ? '' : value;
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
}
