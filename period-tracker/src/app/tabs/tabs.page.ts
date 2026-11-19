
import { Component } from '@angular/core';

import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  homeOutline,
  home,
  calendarOutline,
  calendar,
  addCircleOutline,
  addCircle,
  timeOutline,
  time,
  personOutline,
  person
} from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: true,
  imports: [
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonIcon,
    IonLabel
  ]
})
export class TabsPage {

  constructor() {

    // Register navigation icons.
    addIcons({
      homeOutline,
      home,
      calendarOutline,
      calendar,
      addCircleOutline,
      addCircle,
      timeOutline,
      time,
      personOutline,
      person
    });

  }

}
