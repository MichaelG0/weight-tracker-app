import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CssThemeService {
  private readonly THEME_KEY = 'wt-theme-preference';
  private readonly _isDarkMode = signal<boolean>(false);

  constructor() {}

  getThemeKey(): string {
    return this.THEME_KEY;
  }

  isDarkMode(): boolean {
    return this._isDarkMode();
  }

  toggleTheme(isDark: boolean) {
    this._isDarkMode.update(() => isDark);
  }

  themeVar(name: string, fallback: string): string {
    return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
  }

  rgbaVar(name: string, alpha: number, fallbackRgb: string): string {
    return `rgba(${this.themeVar(name, fallbackRgb)}, ${alpha})`;
  }
}
