import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader';
import * as Sentry from '@sentry/capacitor';
import * as SentryAngular from '@sentry/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { Capacitor } from '@capacitor/core';
import { ErrorHandler, provideAppInitializer, inject } from '@angular/core';
import { DatabaseService } from './app/services/database.service';
import { environment } from './environments/environment';

Sentry.init(
  {
    dsn: environment.sentryDsn,
    enabled: environment.production,      // no events from dev builds
    environment: environment.production ? 'production' : 'development',
    integrations: [SentryAngular.captureConsoleIntegration({ levels: ['error'] })],
    release: 'my-app@1.2.3',              // must match what you use when uploading source maps
    dist: '42',                           // build number, same rule
    sendDefaultPii: false,
    tracesSampleRate: 0,                  // performance tracing off until you want it
    beforeBreadcrumb(breadcrumb) {
      // Debug/log console breadcrumbs include weight values, so drop them.
      if (breadcrumb.category === 'console' && breadcrumb.level !== 'warning' && breadcrumb.level !== 'error') {
        return null;
      }
      return breadcrumb;
    },
    beforeSend(event) {
      // last chance to scrub anything sensitive
      delete event.user?.email;
      delete event.request?.cookies;
      return event;
    },
  },
  SentryAngular.init,
);

if (Capacitor.getPlatform() === 'web') {
  jeepSqlite(window);

  const jeepSqliteElem = document.createElement('jeep-sqlite') as HTMLElement & { autoSave: boolean };
  // Saves every write to IndexedDB so the Jeep SQLite Browser extension sees changes.
  jeepSqliteElem.autoSave = !environment.production;
  document.body.appendChild(jeepSqliteElem);
}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    {
      provide: ErrorHandler,
      useValue: SentryAngular.createErrorHandler({
        showDialog: false, // don't pop Sentry's user-feedback dialog
        logErrors: false, // turned off so errors aren't reported twice (captureException + captureConsoleIntegration)
      }),
    },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideAppInitializer(() => {
      const dbService = inject(DatabaseService);
      return dbService.initializePlugin();
    }),
  ],
});
