
import { Injectable } from '@angular/core';

import {
  BehaviorSubject,
  firstValueFrom,
  timeout
} from 'rxjs';

import { PeriodService } from './period';
import { WellnessService } from './wellness';
import { SyncJournalService } from './sync-journal';

import {
  ShedApiService,
  ShedUser
} from './shed-api';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly sessionKey =
    'shed.auth.session.tab.v1';

  private readonly requestTimeout = 15000;

  private readonly userSubject =
    new BehaviorSubject<ShedUser | null>(null);

  readonly currentUser$ =
    this.userSubject.asObservable();

  private initialized = false;

  get currentUser(): ShedUser | null {
    return this.userSubject.value;
  }

  constructor(
    private readonly api: ShedApiService,
    private readonly periods: PeriodService,
    private readonly wellness: WellnessService,
    private readonly syncJournal: SyncJournalService
  ) {}

  // ========================================
  // INITIALIZE / RESTORE SESSION
  // ========================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    const token = this.readSessionToken();

    if (!token) {
      return;
    }

    this.clearVisibleAccount();

    try {
      this.api.setAccessToken(token);

      const response = await firstValueFrom(
        this.api.getCurrentUser().pipe(
          timeout(this.requestTimeout)
        )
      );

      if (
        !response.success ||
        !this.validUser(response.user)
      ) {
        throw new Error('Invalid saved session.');
      }

      this.activateAccount(response.user);

    } catch {
      this.clearLocalSession();
    }
  }

  // ========================================
  // LOGIN
  // ========================================

  async login(
    email: string,
    password: string
  ): Promise<ShedUser> {

    this.clearLocalSession();

    try {
      const response = await firstValueFrom(
        this.api.login(email, password).pipe(
          timeout(this.requestTimeout)
        )
      );

      if (
        !response.success ||
        !this.validUser(response.user)
      ) {
        throw new Error(
          'Invalid login response from Shed API.'
        );
      }

      const token = response.accessToken;

      if (
        typeof token !== 'string' ||
        !this.validToken(token)
      ) {
        throw new Error(
          'The Shed API returned an invalid session token.'
        );
      }

      this.saveSessionToken(token);

      this.activateAccount(response.user);

      return response.user;

    } catch (error) {
      this.clearLocalSession();
      throw error;
    }
  }

  // ========================================
  // REFRESH SIGNED-IN ACCOUNT DETAILS
  // ========================================

  async refreshCurrentUser(): Promise<ShedUser> {

    const originalUser = this.currentUser;

    if (!originalUser || !this.api.isAuthenticated()) {
      throw new Error('Please log in again.');
    }

    const response = await firstValueFrom(
      this.api.getCurrentUser().pipe(
        timeout(this.requestTimeout)
      )
    );

    if (
      !response.success ||
      !this.validUser(response.user) ||
      response.user.id !== originalUser.id
    ) {
      throw new Error(
        'Unable to verify updated account details.'
      );
    }

    // Do not publish a response if the account
    // was switched during the HTTP request.
    if (
      this.currentUser?.id !== originalUser.id
    ) {
      throw new Error(
        'Account changed while refreshing details.'
      );
    }

    // Preserve the current records, Sync Journal,
    // and account-specific profile.
    this.userSubject.next(response.user);

    return response.user;
  }

  // ========================================
  // LOGOUT
  // ========================================

  async logout(): Promise<boolean> {

    let remoteLogout = null;

    try {
      if (this.api.isAuthenticated()) {
        remoteLogout = this.api.logout().pipe(
          timeout(this.requestTimeout)
        );
      }
    } catch {
      // Local logout must still proceed.
    }

    this.clearLocalSession();

    if (!remoteLogout) {
      return false;
    }

    try {
      await firstValueFrom(remoteLogout);
      return true;
    } catch {
      return false;
    }
  }

  // ========================================
  // ACCOUNT ACTIVATION
  // ========================================

  private activateAccount(user: ShedUser): void {

    this.periods.setActiveAccount(user.id);

    this.wellness.setActiveAccount(user.id);

    this.syncJournal.setActiveAccount(user.id);

    this.userSubject.next(user);
  }

  // ========================================
  // CLEAR ACCOUNT CONTEXT
  // ========================================

  private clearVisibleAccount(): void {

    this.periods.clearActiveAccount();

    this.wellness.clearActiveAccount();

    this.syncJournal.clearActiveAccount();

    this.userSubject.next(null);
  }

  private clearLocalSession(): void {
    this.api.clearAccessToken();
    this.clearStoredToken();
    this.clearVisibleAccount();
  }

  // ========================================
  // USER VALIDATION
  // ========================================

  private validUser(
    user: ShedUser | null | undefined
  ): user is ShedUser {
    return (
      !!user &&
      Number.isInteger(user.id) &&
      user.id > 0 &&
      typeof user.displayName === 'string' &&
      typeof user.email === 'string'
    );
  }

  private validToken(token: string): boolean {
    return /^[a-f0-9]{64}$/i.test(token);
  }

  // ========================================
  // READ SESSION TOKEN
  // ========================================

  private readSessionToken(): string | null {
    try {
      const token = sessionStorage.getItem(
        this.sessionKey
      );

      if (!token) {
        return null;
      }

      if (!this.validToken(token)) {
        this.clearStoredToken();
        return null;
      }

      return token;

    } catch {
      return null;
    }
  }

  // ========================================
  // SAVE SESSION TOKEN
  // ========================================

  private saveSessionToken(token: string): void {

    if (!this.validToken(token)) {
      throw new Error(
        'Invalid authentication token format.'
      );
    }

    try {
      sessionStorage.setItem(
        this.sessionKey,
        token
      );

      const savedToken = sessionStorage.getItem(
        this.sessionKey
      );

      if (savedToken !== token) {
        throw new Error(
          'Session token was not saved correctly.'
        );
      }

    } catch {
      throw new Error(
        'Unable to save your login session. ' +
        'Please check your browser storage settings.'
      );
    }
  }

  private clearStoredToken(): void {
    try {
      sessionStorage.removeItem(
        this.sessionKey
      );
    } catch {
      // In-memory credentials were still cleared.
    }
  }
}
