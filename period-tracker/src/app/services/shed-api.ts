
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Capacitor } from '@capacitor/core';

import { PeriodRecord } from '../models/period.model';
import { WellnessRecord } from '../models/wellness.model';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface ApiMessageResponse {
  success: boolean;
  message: string;
}

export interface ShedUser {
  id: number;
  displayName: string;
  email: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  user: ShedUser;
}

export interface UserResponse {
  success: boolean;
  user: ShedUser;
}

export interface HealthResponse {
  success: boolean;
  application: string;
  database: string;
  message: string;
}

export type PeriodPayload =
  Omit<PeriodRecord, 'id'> & {
    clientRecordId?: string;
  };

export type WellnessPayload =
  Omit<WellnessRecord, 'id'> & {
    clientRecordId?: string;
  };

@Injectable({
  providedIn: 'root'
})
export class ShedApiService {

  private readonly serverStorageKey =
    'shed.api.server.address.v1';

  private readonly apiPath =
    '/shed-api/public/api';

  private accessToken: string | null = null;

  private nativeServerConfirmed = false;
  private nativeApiBaseUrl: string | null = null;

  constructor(
    private readonly http: HttpClient
  ) {}

  // ========================================
  // VALIDATE A PRIVATE LAN IPv4 ADDRESS
  // ========================================

  private isPrivateIp(host: string): boolean {
    const parts = host.split('.');

    if (parts.length !== 4) {
      return false;
    }

    if (parts.some(part =>
      !/^\d{1,3}$/.test(part) ||
      Number(part) > 255
    )) {
      return false;
    }

    const numbers = parts.map(Number);

    return (
      numbers[0] === 10 ||
      (
        numbers[0] === 172 &&
        numbers[1] >= 16 &&
        numbers[1] <= 31
      ) ||
      (
        numbers[0] === 192 &&
        numbers[1] === 168
      )
    );
  }

  // ========================================
  // NORMALIZE ENTERED SERVER ADDRESS
  // ========================================

  private normalizeServerAddress(
    value: string
  ): string {

    let input = value.trim();

    // Accept either:
    // 192.168.1.5
    // http://192.168.1.5
    // http://192.168.1.5:80

    if (!/^https?:\/\//i.test(input)) {
      input = `http://${input}`;
    }

    let parsed: URL;

    try {
      parsed = new URL(input);
    } catch {
      throw new Error(
        'Enter a valid local network IP address.'
      );
    }

    if (
      parsed.protocol !== 'http:' ||
      !this.isPrivateIp(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (
        parsed.pathname !== '/' &&
        parsed.pathname !== ''
      )
    ) {
      throw new Error(
        'Enter the laptop private IPv4 address, ' +
        'such as 192.168.1.5.'
      );
    }

    return parsed.origin;
  }

  // ========================================
  // CONFIGURE NATIVE APK SERVER
  // ========================================

  private resolveNativeServer(): string {

    if (
      this.nativeServerConfirmed &&
      this.nativeApiBaseUrl
    ) {
      return this.nativeApiBaseUrl;
    }

    let savedAddress = '';

    try {
      savedAddress =
        localStorage.getItem(this.serverStorageKey) ?? '';
    } catch {
      // Browser storage may be unavailable.
    }

    const answer = window.prompt(
      'SHED API SERVER\n\n' +
      'Enter your laptop IPv4 address.\n' +
      'Phone and laptop must use the same Wi-Fi ' +
      'or hotspot network.\n\n' +
      'Example: 192.168.1.5\n\n' +
      'You can update this address when reopening the app.',
      savedAddress
    );

    // Cancel keeps the previously configured address.
    // No previous address means authentication cannot
    // proceed until a server is configured.
    const entered = answer === null
      ? savedAddress
      : answer.trim();

    if (!entered) {
      throw new Error(
        'Shed API server is not configured. ' +
        'Enter your laptop IPv4 address.'
      );
    }

    const normalized =
      this.normalizeServerAddress(entered);

    try {
      localStorage.setItem(
        this.serverStorageKey,
        normalized
      );
    } catch {
      // Still allow use during this app session.
    }

    this.nativeApiBaseUrl = normalized;
    this.nativeServerConfirmed = true;

    return normalized;
  }

  // ========================================
  // API URL FOR BROWSER AND APK
  // ========================================

  private get apiUrl(): string {

    // Installed Android / iOS application:
    // request a reachable LAN backend address.
    if (Capacitor.isNativePlatform()) {
      return (
        this.resolveNativeServer() +
        this.apiPath
      );
    }

    // Ionic browser development:
    // localhost or the laptop's LAN hostname.
    return (
      `http://${window.location.hostname}` +
      this.apiPath
    );
  }

  // ========================================
  // AUTH TOKEN
  // ========================================

  setAccessToken(token: string): void {
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      throw new Error(
        'Invalid session credential.'
      );
    }

    this.accessToken = token;
  }

  clearAccessToken(): void {
    this.accessToken = null;
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  private getAuthHeaders(): HttpHeaders {

    if (!this.accessToken) {
      throw new Error(
        'Please log in before accessing the API.'
      );
    }

    return new HttpHeaders({
      Authorization: `Bearer ${this.accessToken}`
    });
  }

  // ========================================
  // HEALTH
  // ========================================

  checkHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(
      `${this.apiUrl}/health`
    );
  }

  // ========================================
  // REGISTRATION
  // ========================================

  register(data: {
    displayName: string;
    email: string;
    password: string;
  }): Observable<ApiMessageResponse> {

    return this.http.post<ApiMessageResponse>(
      `${this.apiUrl}/auth/register`,
      data
    );
  }

  // ========================================
  // LOGIN
  // ========================================

  login(
    email: string,
    password: string
  ): Observable<LoginResponse> {

    return this.http.post<LoginResponse>(
      `${this.apiUrl}/auth/login`,
      { email, password }
    ).pipe(
      tap(response => {
        if (response.success) {
          this.setAccessToken(
            response.accessToken
          );
        }
      })
    );
  }

  // ========================================
  // CURRENT ACCOUNT
  // ========================================

  getCurrentUser(): Observable<UserResponse> {

    return this.http.get<UserResponse>(
      `${this.apiUrl}/auth/me`,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  // ========================================
  // CHANGE EMAIL
  // ========================================

  changeEmail(data: {
    newEmail: string;
    currentPassword: string;
  }): Observable<ApiMessageResponse> {

    return this.http.post<ApiMessageResponse>(
      `${this.apiUrl}/auth/change-email`,
      data,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  // ========================================
  // CHANGE PASSWORD
  // ========================================

  changePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Observable<ApiMessageResponse> {

    return this.http.post<ApiMessageResponse>(
      `${this.apiUrl}/auth/change-password`,
      data,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  // ========================================
  // LOGOUT
  // ========================================

  logout(): Observable<ApiMessageResponse> {

    return this.http.post<ApiMessageResponse>(
      `${this.apiUrl}/auth/logout`,
      {},
      {
        headers: this.getAuthHeaders()
      }
    ).pipe(
      tap(() => {
        this.accessToken = null;
      })
    );
  }

  // ========================================
  // PERIOD CRUD
  // ========================================

  getPeriods(): Observable<ApiResponse<PeriodRecord[]>> {

    return this.http.get<ApiResponse<PeriodRecord[]>>(
      `${this.apiUrl}/periods`,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  getPeriodById(
    id: number
  ): Observable<ApiResponse<PeriodRecord>> {

    return this.http.get<ApiResponse<PeriodRecord>>(
      `${this.apiUrl}/periods/${id}`,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  createPeriod(
    data: PeriodPayload
  ): Observable<ApiResponse<PeriodRecord>> {

    return this.http.post<ApiResponse<PeriodRecord>>(
      `${this.apiUrl}/periods`,
      data,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  updatePeriod(
    id: number,
    data: PeriodPayload
  ): Observable<ApiResponse<PeriodRecord>> {

    return this.http.put<ApiResponse<PeriodRecord>>(
      `${this.apiUrl}/periods/${id}`,
      data,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  deletePeriod(
    id: number
  ): Observable<ApiMessageResponse> {

    return this.http.delete<ApiMessageResponse>(
      `${this.apiUrl}/periods/${id}`,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  // ========================================
  // WELLNESS CRUD
  // ========================================

  getWellnessRecords():
    Observable<ApiResponse<WellnessRecord[]>> {

    return this.http.get<ApiResponse<WellnessRecord[]>>(
      `${this.apiUrl}/wellness`,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  getWellnessById(
    id: number
  ): Observable<ApiResponse<WellnessRecord>> {

    return this.http.get<ApiResponse<WellnessRecord>>(
      `${this.apiUrl}/wellness/${id}`,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  createWellness(
    data: WellnessPayload
  ): Observable<ApiResponse<WellnessRecord>> {

    return this.http.post<ApiResponse<WellnessRecord>>(
      `${this.apiUrl}/wellness`,
      data,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  updateWellness(
    id: number,
    data: WellnessPayload
  ): Observable<ApiResponse<WellnessRecord>> {

    return this.http.put<ApiResponse<WellnessRecord>>(
      `${this.apiUrl}/wellness/${id}`,
      data,
      {
        headers: this.getAuthHeaders()
      }
    );
  }

  deleteWellness(
    id: number
  ): Observable<ApiMessageResponse> {

    return this.http.delete<ApiMessageResponse>(
      `${this.apiUrl}/wellness/${id}`,
      {
        headers: this.getAuthHeaders()
      }
    );
  }
}
