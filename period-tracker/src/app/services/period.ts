import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { PeriodRecord } from '../models/period.model';

@Injectable({
  providedIn: 'root'
})
export class PeriodService {

  // ========================================
  // LOCAL STORAGE CONFIGURATION
  // ========================================

  // OLD STORAGE KEY
  // This is preserved and is NOT deleted.
  private readonly legacyStorageKey = 'periodRecords';

  // Guest/local storage used when no account is active.
  private readonly guestStorageKey =
    'shed.periodRecords.guest.v1';

  // Account-specific storage.
  private readonly accountStoragePrefix =
    'shed.periodRecords.user';

  // Currently active authenticated account.
  // null = no authenticated account.
  private activeUserId: number | null = null;

  // ========================================
  // REACTIVE PERIOD RECORDS
  // ========================================

  private readonly recordsSubject =
    new BehaviorSubject<PeriodRecord[]>([]);

  readonly records$ =
    this.recordsSubject.asObservable();

  // ========================================
  // INITIALIZATION
  // ========================================

  constructor() {
    // Preserve old local records by copying them
    // into guest storage if guest storage does not
    // exist yet.
    //
    // IMPORTANT:
    // The old "periodRecords" key is NOT deleted.
    this.prepareGuestStorage();

    // At application startup there is no authenticated
    // account because the current API token is memory-only.
    this.loadRecords();
  }

  // ========================================
  // ACCOUNT ISOLATION
  // ========================================

  /**
   * Switch local storage to a specific account.
   *
   * Example:
   * Account 1 -> shed.periodRecords.user.1.v1
   * Account 2 -> shed.periodRecords.user.2.v1
   */
  setActiveAccount(userId: number): void {

    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      throw new Error(
        'Invalid authenticated account ID.'
      );
    }

    this.activeUserId = userId;

    // Load ONLY this account's local records.
    this.loadRecords();
  }

  /**
   * Remove the authenticated account from the
   * active local data scope.
   *
   * We intentionally clear the visible records
   * instead of loading another account's records.
   */
  clearActiveAccount(): void {

    this.activeUserId = null;

    // Clear the currently visible account data.
    this.recordsSubject.next([]);
  }

  /**
   * Returns the storage key currently being used.
   */
  private getActiveStorageKey(): string {

    if (this.activeUserId === null) {
      return this.guestStorageKey;
    }

    return (
      `${this.accountStoragePrefix}` +
      `.${this.activeUserId}.v1`
    );
  }

  // ========================================
  // READ ALL PERIOD RECORDS
  // ========================================

  getRecords(): PeriodRecord[] {

    return this.recordsSubject.value.map(
      record => ({ ...record })
    );
  }

  // ========================================
  // READ A SINGLE PERIOD RECORD
  // ========================================

  getRecordById(
    id: number
  ): PeriodRecord | undefined {

    const record =
      this.recordsSubject.value.find(
        item => item.id === id
      );

    return record
      ? { ...record }
      : undefined;
  }

  // ========================================
  // VALIDATE DATE FORMAT
  // ========================================

  private isValidDate(
    value: unknown
  ): value is string {

    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return false;
    }

    const date = new Date(
      value + 'T00:00:00Z'
    );

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }

  // ========================================
  // GET TODAY IN LOCAL TIMEZONE
  // ========================================

  private getTodayDate(): string {

    const now = new Date();

    const year = now.getFullYear();

    const month = String(
      now.getMonth() + 1
    ).padStart(2, '0');

    const day = String(
      now.getDate()
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  // ========================================
  // VALIDATE SAVED RECORDS
  // ========================================

  private filterValidRecords(
    parsed: unknown[]
  ): PeriodRecord[] {

    return parsed.filter(
      (item): item is PeriodRecord => {

        if (
          item === null ||
          typeof item !== 'object'
        ) {
          return false;
        }

        const record =
          item as Record<string, unknown>;

        return (
          typeof record['id'] === 'number' &&
          Number.isFinite(record['id']) &&

          this.isValidDate(
            record['startDate']
          ) &&

          this.isValidDate(
            record['endDate']
          ) &&

          (record['endDate'] as string) >=
            (record['startDate'] as string) &&

          ['Light', 'Medium', 'Heavy'].includes(
            record['flow'] as string
          ) &&

          typeof record['notes'] === 'string'
        );
      }
    );
  }

  // ========================================
  // PREPARE GUEST STORAGE
  // ========================================

  private prepareGuestStorage(): void {

    try {

      // If guest storage already exists,
      // do not overwrite it.
      const guestData =
        localStorage.getItem(
          this.guestStorageKey
        );

      if (guestData !== null) {
        return;
      }

      // Check old storage.
      const legacyData =
        localStorage.getItem(
          this.legacyStorageKey
        );

      if (!legacyData) {
        return;
      }

      const parsed: unknown =
        JSON.parse(legacyData);

      if (!Array.isArray(parsed)) {
        return;
      }

      const validRecords =
        this.filterValidRecords(parsed);

      // Preserve the existing records in the new
      // guest storage.
      //
      // IMPORTANT:
      // The old "periodRecords" key is NOT deleted.
      localStorage.setItem(
        this.guestStorageKey,
        JSON.stringify(validRecords)
      );

    } catch (error) {

      console.error(
        'Unable to prepare guest period storage:',
        error
      );

    }
  }

  // ========================================
  // LOAD SAVED PERIOD RECORDS
  // ========================================

  loadRecords(): void {

    try {

      const storageKey =
        this.getActiveStorageKey();

      const saved =
        localStorage.getItem(storageKey);

      const parsed: unknown = saved
        ? JSON.parse(saved)
        : [];

      if (!Array.isArray(parsed)) {
        throw new Error(
          'Invalid saved period data.'
        );
      }

      const records =
        this.filterValidRecords(parsed);

      this.recordsSubject.next(
        records.map(record => ({ ...record }))
      );

    } catch (error) {

      console.error(
        'Unable to load period records:',
        error
      );

      this.recordsSubject.next([]);
    }
  }

  // ========================================
  // VALIDATE NEW OR UPDATED PERIOD DATES
  // ========================================

  private validateDates(
    startDate: string,
    endDate: string
  ): void {

    if (
      !this.isValidDate(startDate) ||
      !this.isValidDate(endDate)
    ) {
      throw new Error(
        'Please enter valid period dates.'
      );
    }

    if (endDate < startDate) {
      throw new Error(
        'Period end date cannot be before start date.'
      );
    }

    const today =
      this.getTodayDate();

    if (
      startDate > today ||
      endDate > today
    ) {
      throw new Error(
        'Future period dates cannot be logged.'
      );
    }
  }

  // ========================================
  // CREATE A NEW PERIOD RECORD
  // ========================================

  addRecord(
    data: Omit<PeriodRecord, 'id'>
  ): PeriodRecord {

    this.validateDates(
      data.startDate,
      data.endDate
    );

    const records =
      this.getRecords();

    const record: PeriodRecord = {
      id: this.generateId(records),
      startDate: data.startDate,
      endDate: data.endDate,
      flow: data.flow,
      notes: data.notes.trim()
    };

    this.saveRecords([
      ...records,
      record
    ]);

    return { ...record };
  }

  // ========================================
  // UPDATE AN EXISTING PERIOD RECORD
  // ========================================

  updateRecord(
    id: number,
    changes: Omit<PeriodRecord, 'id'>
  ): void {

    this.validateDates(
      changes.startDate,
      changes.endDate
    );

    const records =
      this.getRecords();

    const recordExists =
      records.some(
        record => record.id === id
      );

    if (!recordExists) {
      throw new Error(
        'Period record not found.'
      );
    }

    const updatedRecords =
      records.map(record => {

        if (record.id !== id) {
          return record;
        }

        return {
          id,
          startDate: changes.startDate,
          endDate: changes.endDate,
          flow: changes.flow,
          notes: changes.notes.trim()
        };
      });

    this.saveRecords(updatedRecords);
  }

  // ========================================
  // DELETE A PERIOD RECORD
  // ========================================

  deleteRecord(id: number): void {

    const records =
      this.getRecords();

    const recordExists =
      records.some(
        record => record.id === id
      );

    if (!recordExists) {
      throw new Error(
        'Period record not found.'
      );
    }

    const remainingRecords =
      records.filter(
        record => record.id !== id
      );

    this.saveRecords(
      remainingRecords
    );
  }

  // ========================================
  // GENERATE UNIQUE RECORD ID
  // ========================================

  private generateId(
    records: PeriodRecord[]
  ): number {

    let id = Date.now();

    while (
      records.some(
        record => record.id === id
      )
    ) {
      id++;
    }

    return id;
  }

  // ========================================
  // SAVE AND NOTIFY ALL SUBSCRIBERS
  // ========================================

  private saveRecords(
    records: PeriodRecord[]
  ): void {

    const updatedRecords =
      records.map(
        record => ({ ...record })
      );

    const storageKey =
      this.getActiveStorageKey();

    localStorage.setItem(
      storageKey,
      JSON.stringify(updatedRecords)
    );

    this.recordsSubject.next(
      updatedRecords
    );
  }
}