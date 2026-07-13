import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonToggle, IonIcon } from '@ionic/angular/standalone';
import { CssThemeService } from '../../../services/css-theme.service';
import { addIcons } from 'ionicons';
import { moonOutline, personOutline, notificationsOutline, shieldCheckmarkOutline, logOutOutline } from 'ionicons/icons';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonToggle, IonIcon, GlassHeaderBackdropDirective],
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
