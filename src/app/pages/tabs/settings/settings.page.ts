import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel,
  IonToggle, IonIcon, IonInput, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';
import { CssThemeService } from '../../../services/css-theme.service';
import { DatabaseService, UserSettings, WeightUnit, HeightUnit } from '../../../services/database.service';
import { addIcons } from 'ionicons';
import {
  personOutline, moonOutline, maleFemaleOutline,
  calendarOutline, resizeOutline, saveOutline, checkmarkCircleOutline,
  barbellOutline, bodyOutline,
} from 'ionicons/icons';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel,
    IonToggle, IonIcon, IonInput, IonSelect, IonSelectOption, GlassHeaderBackdropDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage implements OnInit {
  private themeService = inject(CssThemeService);
  private db = inject(DatabaseService);

  name = '';
  age: number | null = null;
  gender = '';
  heightCm: number | null = null;
  weightUnit: WeightUnit = 'kg';
  heightUnit: HeightUnit = 'cm';
  saved = signal(false);

  constructor() {
    addIcons({
      personOutline, moonOutline, maleFemaleOutline,
      calendarOutline, resizeOutline, saveOutline, checkmarkCircleOutline,
      barbellOutline, bodyOutline,
    });
  }

  ngOnInit(): void {
    this.db.settings$.pipe(take(1)).subscribe(settings => {
      if (settings) {
        this.name = settings.name ?? '';
        this.age = settings.age ?? null;
        this.gender = settings.gender ?? '';
        this.heightCm = settings.height_cm ?? null;
        this.weightUnit = settings.weight_unit ?? 'kg';
        this.heightUnit = settings.height_unit ?? 'cm';
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
    const settings: Omit<UserSettings, 'user_id'> = {
      name: this.name || undefined,
      age: this.age ?? undefined,
      gender: this.gender || undefined,
      height_cm: this.heightCm ?? 0,
      weight_unit: this.weightUnit,
      height_unit: this.heightUnit,
    };
    this.db.saveSettings(settings).pipe(take(1)).subscribe(() => {
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 2000);
    });
  }

  get initials(): string {
    if (!this.name) return '?';
    return this.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }
}
