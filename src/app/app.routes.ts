import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'csv-import',
    loadComponent: () => import('./pages/csv-import/csv-import.page').then((m) => m.CsvImportPage),
  },
  {
    path: '',
    loadChildren: () => import('./pages/tabs/tabs.routes').then((m) => m.routes),
  },
];
