import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  combineLatest,
  firstValueFrom,
  Subscription,
  timeout
} from 'rxjs';

import {
  ShedApiService,
  ShedUser
} from '../../services/shed-api';
import { AuthService } from '../../services/auth.service';
import { PeriodService } from '../../services/period';
import { WellnessService } from '../../services/wellness';
import {
  RecordSyncService,
  RecordComparison
} from '../../services/record-sync';

type AccountMode = 'login' | 'register';

@Component({
  selector: 'app-shed-account-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account-panel.html',
  styleUrls: ['./account-panel.scss']
})
export class AccountPanelComponent
  implements OnInit, OnDestroy {

  mode: AccountMode = 'login';
  currentUser: ShedUser | null = null;

  isBusy = false;
  isCheckingSession = false;
  message = '';
  errorMessage = '';

  displayName = '';
  email = '';
  password = '';

  comparison: RecordComparison | null = null;
  isComparing = false;
  comparisonError = '';

  private readonly requestTimeout = 15000;
  private authSubscription?: Subscription;
  private recordsSubscription?: Subscription;
  private comparisonRequestId = 0;

  constructor(
    private readonly shedApi: ShedApiService,
    private readonly recordSync: RecordSyncService,
    private readonly periodService: PeriodService,
    private readonly wellnessService: WellnessService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.authSubscription =
      this.auth.currentUser$.subscribe(user => {
        if (this.currentUser?.id !== user?.id) {
          this.comparisonRequestId++;
          this.resetComparison();
        }

        this.currentUser = user;
        this.updateView();
      });

    this.recordsSubscription = combineLatest([
      this.periodService.records$,
      this.wellnessService.records$
    ]).subscribe(([periods, wellness]) => {
      if (this.currentUser && this.comparison) {
        this.comparison = {
          ...this.comparison,
          localPeriods: periods.length,
          localWellness: wellness.length,
          localTotal: periods.length + wellness.length,
          hasLocalRecords:
            periods.length + wellness.length > 0
        };
      }

      this.updateView();
    });
  }

  ngOnDestroy(): void {
    this.comparisonRequestId++;
    this.authSubscription?.unsubscribe();
    this.recordsSubscription?.unsubscribe();
  }

  private updateView(): void {
    this.cdr.detectChanges();
  }

  private resetComparison(): void {
    this.comparison = null;
    this.comparisonError = '';
  }

  setMode(mode: AccountMode): void {
    if (this.isBusy) return;

    this.mode = mode;
    this.password = '';
    this.message = '';
    this.errorMessage = '';
    this.updateView();
  }

  async submit(): Promise<void> {
    if (this.isBusy) return;

    if (this.mode === 'register') {
      await this.register();
    } else {
      await this.login();
    }
  }

  private async register(): Promise<void> {
    const name = this.displayName.trim();
    const email = this.email.trim();
    const password = this.password;

    this.message = '';
    this.errorMessage = '';

    if (name.length < 2 || name.length > 100) {
      this.errorMessage =
        'Display name must contain 2–100 characters.';
      this.updateView();
      return;
    }

    if (!this.isValidEmail(email)) {
      this.errorMessage =
        'Please enter a valid email address.';
      this.updateView();
      return;
    }

    if (password.length < 12 || password.length > 128) {
      this.errorMessage =
        'Password must contain 12–128 characters.';
      this.updateView();
      return;
    }

    this.isBusy = true;
    this.updateView();

    try {
      await firstValueFrom(
        this.shedApi.register({
          displayName: name,
          email,
          password
        }).pipe(timeout(this.requestTimeout))
      );

      this.mode = 'login';
      this.email = email;
      this.password = '';
      this.message =
        'Account created! You can now log in.';
      this.errorMessage = '';
    } catch (error) {
      this.password = '';
      this.errorMessage = this.getErrorMessage(
        error,
        'Unable to create your account.'
      );
    } finally {
      this.isBusy = false;
      this.updateView();
    }
  }

  private async login(): Promise<void> {
    const email = this.email.trim();
    const password = this.password;

    this.message = '';
    this.errorMessage = '';

    if (!this.isValidEmail(email) || !password) {
      this.errorMessage =
        'Please enter your email and password.';
      this.updateView();
      return;
    }

    this.isBusy = true;
    this.updateView();

    try {
      await this.auth.login(email, password);
      this.password = '';
      this.resetComparison();
      this.message = 'Login successful.';
      this.errorMessage = '';
    } catch (error) {
      this.password = '';
      this.errorMessage = this.getErrorMessage(
        error,
        'Unable to log in.'
      );
    } finally {
      this.isBusy = false;
      this.updateView();
    }
  }

  async logout(): Promise<void> {
    if (
      this.isBusy ||
      this.isComparing ||
      !this.currentUser
    ) {
      return;
    }

    this.isBusy = true;
    this.message = '';
    this.errorMessage = '';
    this.updateView();

    try {
      const revoked = await this.auth.logout();

      this.password = '';
      this.mode = 'login';
      this.resetComparison();

      this.message = revoked
        ? 'Logged out successfully.'
        : 'Signed out on this device. Server could not be reached; the remote session may remain active until it expires.';

      this.errorMessage = '';
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'Unable to finish sign out.'
      );
    } finally {
      this.isBusy = false;
      this.updateView();
    }
  }

  async compareRecords(): Promise<void> {
    if (
      !this.currentUser ||
      this.isBusy ||
      this.isComparing
    ) {
      return;
    }

    const requestId = ++this.comparisonRequestId;
    const accountId = this.currentUser.id;

    this.isComparing = true;
    this.comparisonError = '';
    this.updateView();

    try {
      const result = await firstValueFrom(
        this.recordSync.compareRecords().pipe(
          timeout(this.requestTimeout)
        )
      );

      if (
        requestId !== this.comparisonRequestId ||
        this.currentUser?.id !== accountId
      ) {
        return;
      }

      const local = this.recordSync.getLocalCounts();

      this.comparison = {
        ...result,
        localPeriods: local.periods,
        localWellness: local.wellness,
        localTotal: local.periods + local.wellness,
        hasLocalRecords:
          local.periods + local.wellness > 0
      };
    } catch (error) {
      if (
        requestId === this.comparisonRequestId &&
        this.currentUser?.id === accountId
      ) {
        this.comparisonError = this.getErrorMessage(
          error,
          'Unable to compare records. Please try again.'
        );
      }
    } finally {
      if (requestId === this.comparisonRequestId) {
        this.isComparing = false;
      }
      this.updateView();
    }
  }

  private isValidEmail(value: string): boolean {
    return (
      value.length <= 191 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    );
  }

  private getErrorMessage(
    error: unknown,
    fallback: string
  ): string {
    if (
      error instanceof Error &&
      error.name === 'TimeoutError'
    ) {
      return (
        'The request took too long. ' +
        'Please check the Shed API and try again.'
      );
    }

    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return (
          'Cannot connect to Shed API. ' +
          'Check Apache, MySQL, and your connection.'
        );
      }

      const body: unknown = error.error;

      if (
        body !== null &&
        typeof body === 'object' &&
        'message' in body &&
        typeof body.message === 'string'
      ) {
        return body.message;
      }

      if (error.status === 401) {
        return 'Invalid or expired login session.';
      }
    }

    return error instanceof Error && error.message
      ? error.message
      : fallback;
  }
}
