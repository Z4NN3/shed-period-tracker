import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { WellnessRecord } from '../models/wellness.model';

@Injectable({
  providedIn: 'root'
})
export class WellnessService {

  // ========================================
  // LOCAL STORAGE CONFIGURATION
  // ========================================

  // OLD STORAGE KEY
  // This is preserved and is NOT deleted.
  private readonly legacyStorageKey =
    'symptomRecords';

  // Guest/local storage.
  private readonly guestStorageKey =
    'shed.wellnessRecords.guest.v1';

  // Account-specific storage.
  private readonly accountStoragePrefix =
    'shed.wellnessRecords.user';

  // Currently active authenticated account.
  private activeUserId: number | null = null;

  // ========================================
  // REACTIVE WELLNESS RECORDS
  // ========================================

  private readonly recordsSubject =
    new BehaviorSubject<WellnessRecord[]>([]);

  readonly records$ =
    this.recordsSubject.asObservable();

  // ========================================
  // INITIALIZATION
  // ========================================

  constructor() {

    // Preserve existing local wellness records
    // by copying them to guest storage.
    //
    // IMPORTANT:
    // The old "symptomRecords" key is NOT deleted.
    this.prepareGuestStorage();

    // Start without an authenticated account.
    this.loadRecords();
  }

  // ========================================
  // ACCOUNT ISOLATION
  // ========================================

  /**
   * Switch local storage to a specific account.
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

    // Load ONLY this account's wellness records.
    this.loadRecords();
  }

  /**
   * Clear the authenticated account from the
   * active local view.
   */
  clearActiveAccount(): void {

    this.activeUserId = null;

    // Prevent the previous account's records
    // from remaining visible after logout.
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
  // READ ALL WELLNESS RECORDS
  // ========================================

  getRecords(): WellnessRecord[] {

    return this.recordsSubject.value.map(
      record => ({
        ...record,
        symptoms: [...record.symptoms]
      })
    );
  }

  // ========================================
  // READ ONE WELLNESS RECORD
  // ========================================

  getRecordById(
    id: number
  ): WellnessRecord | undefined {

    const record =
      this.recordsSubject.value.find(
        item => item.id === id
      );

    return record
      ? {
          ...record,
          symptoms: [...record.symptoms]
        }
      : undefined;
  }

  // ========================================
  // VALIDATE SAVED RECORDS
  // ========================================

  private filterValidRecords(
    parsed: unknown[]
  ): WellnessRecord[] {

    return parsed.filter(
      (item): item is WellnessRecord => {

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

          typeof record['date'] === 'string' &&

          typeof record['mood'] === 'string' &&

          Array.isArray(record['symptoms']) &&

          (record['symptoms'] as unknown[]).every(
            (symptom: unknown) =>
              typeof symptom === 'string'
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

      const guestData =
        localStorage.getItem(
          this.guestStorageKey
        );

      // Do not overwrite existing guest data.
      if (guestData !== null) {
        return;
      }

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

      // Copy old records to guest storage.
      //
      // IMPORTANT:
      // The old "symptomRecords" key is NOT deleted.
      localStorage.setItem(
        this.guestStorageKey,
        JSON.stringify(validRecords)
      );

    } catch (error) {

      console.error(
        'Unable to prepare guest wellness storage:',
        error
      );

    }
  }

  // ========================================
  // LOAD SAVED WELLNESS RECORDS
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
          'Invalid saved wellness data.'
        );
      }

      const records =
        this.filterValidRecords(parsed);

      this.recordsSubject.next(
        records.map(record => ({
          ...record,
          symptoms: [...record.symptoms]
        }))
      );

    } catch (error) {

      console.error(
        'Unable to load wellness records:',
        error
      );

      this.recordsSubject.next([]);
    }
  }

  // ========================================
  // VALIDATE WELLNESS DATE
  // ========================================

  private validateDate(
    date: string
  ): void {

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      throw new Error(
        'Please select a valid date.'
      );
    }

    const parsed =
      new Date(
        date + 'T00:00:00Z'
      );

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new Error(
        'Invalid calendar date.'
      );
    }

    const now = new Date();

    const today = [
      now.getFullYear(),
      String(
        now.getMonth() + 1
      ).padStart(2, '0'),
      String(
        now.getDate()
      ).padStart(2, '0')
    ].join('-');

    if (date > today) {
      throw new Error(
        'You cannot log wellness entries for future dates.'
      );
    }
  }

  // ========================================
  // CREATE WELLNESS RECORD
  // ========================================

  addRecord(
    data: Omit<WellnessRecord, 'id'>
  ): WellnessRecord {

    this.validateDate(data.date);

    const records =
      this.getRecords();

    const entry: WellnessRecord = {
      ...data,
      id: this.generateId(records),
      symptoms: [...data.symptoms],
      notes: data.notes.trim()
    };

    this.saveRecords([
      ...records,
      entry
    ]);

    return {
      ...entry,
      symptoms: [...entry.symptoms]
    };
  }

  // ========================================
  // UPDATE WELLNESS RECORD
  // ========================================

  updateRecord(
    id: number,
    changes: Omit<WellnessRecord, 'id'>
  ): void {

    this.validateDate(
      changes.date
    );

    const records =
      this.getRecords();

    if (
      !records.some(
        record => record.id === id
      )
    ) {
      throw new Error(
        'Wellness entry not found.'
      );
    }

    const updated =
      records.map(record =>
        record.id === id
          ? {
              ...changes,
              id,
              symptoms: [
                ...changes.symptoms
              ],
              notes:
                changes.notes.trim()
            }
          : record
      );

    this.saveRecords(updated);
  }

  // ========================================
  // DELETE WELLNESS RECORD
  // ========================================

  deleteRecord(id: number): void {

    const records =
      this.getRecords();

    if (
      !records.some(
        record => record.id === id
      )
    ) {
      throw new Error(
        'Wellness entry not found.'
      );
    }

    this.saveRecords(
      records.filter(
        record => record.id !== id
      )
    );
  }

  // ========================================
  // GENERATE UNIQUE NUMERIC ID
  // ========================================

  private generateId(
    records: WellnessRecord[]
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
  // SAVE DATA TO LOCAL STORAGE
  // ========================================

  private saveRecords(
    records: WellnessRecord[]
  ): void {

    const updatedRecords =
      records.map(record => ({
        ...record,
        symptoms: [...record.symptoms]
      }));

    const storageKey =
      this.getActiveStorageKey();

    localStorage.setItem(
      storageKey,
      JSON.stringify(updatedRecords)
    );

    this.recordsSubject.next(
      updatedRecords.map(record => ({
        ...record,
        symptoms: [...record.symptoms]
      }))
    );
  }
}