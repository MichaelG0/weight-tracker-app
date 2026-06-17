import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonHeader, IonToolbar, IonContent, IonList, IonItem, IonLabel, IonToggle, IonIcon } from '@ionic/angular/standalone';
import { CssThemeService } from '../../../services/css-theme.service';
import { addIcons } from 'ionicons';
import { moonOutline, personOutline, notificationsOutline, shieldCheckmarkOutline, logOutOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonList, IonItem, IonLabel, IonToggle, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tab3Page {
  themeService = inject(CssThemeService);

  constructor() {
    addIcons({ moonOutline, personOutline, notificationsOutline, shieldCheckmarkOutline, logOutOutline });
  }

  toggleTheme(event: any) {
    this.themeService.toggleTheme(event.detail.checked);
  }
}
