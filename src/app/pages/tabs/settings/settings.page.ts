import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonHeader, IonToolbar, IonContent, IonList, IonItem, IonLabel, IonToggle, IonIcon } from '@ionic/angular/standalone';
import { CssThemeService } from '../../../services/css-theme.service';
import { addIcons } from 'ionicons';
import { moonOutline, personOutline, notificationsOutline, shieldCheckmarkOutline, logOutOutline } from 'ionicons/icons';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonList, IonItem, IonLabel, IonToggle, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  themeService = inject(CssThemeService);

  constructor() {
    addIcons({ moonOutline, personOutline, notificationsOutline, shieldCheckmarkOutline, logOutOutline });
  }

  toggleTheme(event: any) {
    this.themeService.toggleTheme(event.detail.checked);
  }
}
