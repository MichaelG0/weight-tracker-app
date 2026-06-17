import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { CssThemeService } from './services/css-theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly cssThemeService = inject(CssThemeService);

  constructor() {
    this.initializeTheme();

    effect(() => {
      const isDark = this.cssThemeService.isDarkMode();
      if (isDark) {
        document.body.classList.add('ion-palette-dark');
        localStorage.setItem(this.cssThemeService.getThemeKey(), 'dark');
      } else {
        document.body.classList.remove('ion-palette-dark');
        localStorage.setItem(this.cssThemeService.getThemeKey(), 'light');
      }
    });
  }

  private initializeTheme() {
    const saved = localStorage.getItem(this.cssThemeService.getThemeKey());
    // Default to dark if not set, or use saved preference
    const isDark = saved === null ? false : saved === 'dark';
    this.cssThemeService.toggleTheme(isDark);
  }
}
