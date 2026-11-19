
import {
  Component,
  OnDestroy
} from '@angular/core';

import {
  Router,
  NavigationEnd
} from '@angular/router';

import {
  IonApp,
  IonRouterOutlet
} from '@ionic/angular';

import {
  combineLatest,
  filter,
  map,
  startWith,
  Subscription
} from 'rxjs';

import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [IonApp, IonRouterOutlet]
})
export class AppComponent implements OnDestroy {

  private readonly navigationSubscription: Subscription;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {
    const navigation$ = this.router.events.pipe(
      filter(
        event => event instanceof NavigationEnd
      ),
      map(() => this.router.url),
      startWith(this.router.url)
    );

    this.navigationSubscription = combineLatest([
      this.auth.currentUser$,
      navigation$
    ]).subscribe(([user, url]) => {
      if (!user && url.startsWith('/tabs')) {
        void this.router.navigateByUrl(
          '/welcome',
          { replaceUrl: true }
        );
      }
    });
  }

  ngOnDestroy(): void {
    this.navigationSubscription.unsubscribe();
  }
}
