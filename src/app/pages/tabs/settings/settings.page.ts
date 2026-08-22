import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { cmToFtIn } from 'src/app/utils/unit-conversion.util';
import { ProfileInfoModalComponent, ProfileInfoTopic } from 'src/app/components/profile-info-modal/profile-info-modal.component';

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
    IonChip,
    IonButton,
    GlassHeaderBackdropDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private themeService = inject(CssThemeService);
  private db = inject(DatabaseService);
  private modalCtrl = inject(ModalController);

  name = '';
  age: number | null = null;
  gender = '';
  heightCm: number | null = null;
  heightFt: number | null = null;
  heightIn: number | null = null;
  weightUnit: WeightUnit = 'kg';
  heightUnit: HeightUnit = 'cm';
  activityLevel: ActivityLevel | '' = '';
  experience: Experience | '' = '';
  bodyType: BodyType | '' = '';

  readonly activityLevels: ActivityLevel[] = ['Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Extra Active'];
  readonly experienceLevels: Experience[] = ['Beginner', 'Intermediate', 'Advanced'];
  readonly bodyTypes: BodyType[] = ['Ectomorph', 'Mesomorph', 'Endomorph'];

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

    this.db.settings$.pipe(takeUntilDestroyed()).subscribe(settings => {
      if (settings) {
        this.name = settings.name ?? '';
        this.age = settings.age ?? null;
        this.gender = settings.gender ?? '';
        this.heightCm = settings.height_cm ?? null;
        const ftIn = this.heightCm ? cmToFtIn(this.heightCm) : null;
        this.heightFt = ftIn?.feet ?? null;
        this.heightIn = ftIn?.inches ?? null;
        this.weightUnit = settings.weight_unit ?? 'kg';
        this.heightUnit = settings.height_unit ?? 'cm';
        this.activityLevel = settings.activity_level ?? '';
        this.experience = settings.experience ?? '';
        this.bodyType = settings.body_type ?? '';
      }
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
      age: this.age ?? undefined,
      gender: this.gender || undefined,
      weight_unit: this.weightUnit,
      height_unit: this.heightUnit,
      activity_level: this.activityLevel || undefined,
      experience: this.experience || undefined,
      body_type: this.bodyType || undefined,
    };

    if (this.heightUnit === 'cm' && this.heightCm) {
      settings.height_cm = this.heightCm;
    } else if (this.heightUnit === 'ft/in' && (this.heightFt || this.heightIn)) {
      settings.heightFtIn = { feet: this.heightFt, inches: this.heightIn };
    }

    this.db.saveSettings(settings).pipe(take(1)).subscribe();
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
