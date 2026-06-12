import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CssThemeService {
  themeVar(name: string, fallback: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  rgbaVar(name: string, alpha: number, fallbackRgb: string): string {
    return `rgba(${this.themeVar(name, fallbackRgb)}, ${alpha})`;
  }
}