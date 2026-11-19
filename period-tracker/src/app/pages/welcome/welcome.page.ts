
import {
  Component,
  OnInit,
  OnDestroy
} from '@angular/core';

import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { AccountPanelComponent } from '../profile/account-panel';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [AccountPanelComponent],
  templateUrl: './welcome.page.html',
  styleUrls: ['./welcome.page.scss']
})
export class WelcomePage implements OnInit, OnDestroy {

  private authSubscription?: Subscription;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.authSubscription =
      this.auth.currentUser$.subscribe(user => {
        if (user) {
          void this.router.navigateByUrl(
            '/tabs/dashboard',
            { replaceUrl: true }
          );
        }
      });
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }
}
