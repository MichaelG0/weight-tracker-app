import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { Capacitor } from '@capacitor/core';
import { provideAppInitializer, inject } from '@angular/core';
import { DatabaseService } from './app/services/database.service';

if (Capacitor.getPlatform() === 'web') {
  jeepSqlite(window);
  
  const jeepSqliteElem = document.createElement('jeep-sqlite');
  document.body.appendChild(jeepSqliteElem);
}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideAppInitializer(() => {
      const dbService = inject(DatabaseService);
      return dbService.initializePlugin();
    })
  ],
});
