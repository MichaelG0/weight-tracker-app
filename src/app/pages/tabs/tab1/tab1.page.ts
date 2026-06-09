import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trendingDownOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon],
})
export class Tab1Page {
  constructor() {
    addIcons({ trendingDownOutline });
  }
}
