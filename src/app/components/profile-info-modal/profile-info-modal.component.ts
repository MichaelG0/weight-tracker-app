import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

export type ProfileInfoTopic = 'activity' | 'experience' | 'bodyType';

@Component({
  selector: 'app-profile-info-modal',
  templateUrl: 'profile-info-modal.component.html',
  styleUrls: ['profile-info-modal.component.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileInfoModalComponent {
  @Input() topic: ProfileInfoTopic = 'activity';

  private modalCtrl = new ModalController();

  constructor() {
    addIcons({ closeOutline });
  }
}
