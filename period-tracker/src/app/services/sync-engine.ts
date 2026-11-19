
import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';

import { AuthService } from './auth.service';
import { ShedApiService } from './shed-api';
import { PeriodService } from './period';
import { WellnessService } from './wellness';

import {
  SyncJournalService,
  SyncJournalEntry
} from './sync-journal';

export interface SyncRunResult {
  processed: number;
  synced: number;
  conflicts: number;
  pending: number;
  stoppedReason: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class SyncEngineService {

  private readonly requestTimeoutMs = 15000;

  private running = false;

  constructor(
    private readonly auth: AuthService,
    private readonly api: ShedApiService,
    private readonly periods: PeriodService,
    private readonly wellness: WellnessService,
    private readonly journal: SyncJournalService
  ) {}

  // ========================================
  // PROCESS PENDING SYNC ENTRIES
  // ========================================

  async runPending(): Promise<SyncRunResult> {

    const result: SyncRunResult = {
      processed: 0,
      synced: 0,
      conflicts: 0,
      pending: 0,
      stoppedReason: null
    };

    if (this.running) {
      result.stoppedReason =
        'Synchronization is already running.';
      return result;
    }

    const accountId = this.auth.currentUser?.id;

    if (!accountId || !this.api.isAuthenticated()) {
      result.stoppedReason =
        'Authentication is required.';
      return result;
    }

    if (
      typeof navigator !== 'undefined' &&
      !navigator.onLine
    ) {
      result.stoppedReason = 'Device is offline.';
      result.pending =
        this.journal.getPendingEntries().length;

      return result;
    }

    this.running = true;

    try {

      const pending =
        this.journal.getPendingEntries();

      for (const snapshot of pending) {

        // Never continue after account switching.
        if (this.auth.currentUser?.id !== accountId) {
          result.stoppedReason =
            'Account changed during synchronization.';
          break;
        }

        const current = this.journal.getEntry(
          snapshot.recordType,
          snapshot.localId
        );

        // Ignore entries changed since queue snapshot.
        if (
          !current ||
          current.status !== 'pending' ||
          current.updatedAt !== snapshot.updatedAt ||
          current.action !== snapshot.action
        ) {
          continue;
        }

        result.processed++;

        try {

          const serverId =
            await this.syncOne(snapshot);

          if (this.auth.currentUser?.id !== accountId) {
            result.stoppedReason =
              'Account changed during synchronization.';
            break;
          }

          const latest = this.journal.getEntry(
            snapshot.recordType,
            snapshot.localId
          );

          if (!latest) {
            // The entry may have been removed locally
            // while its request was in progress.
            result.stoppedReason =
              'A sync entry changed during its request. ' +
              'Reconciliation is required.';
            break;
          }

          if (
            latest.updatedAt !== snapshot.updatedAt ||
            latest.action !== snapshot.action ||
            latest.status !== 'pending'
          ) {
            // Do not claim a stale operation is synced.
            // Stop to avoid overwriting newer local work.
            this.journal.markConflict(
              snapshot.recordType,
              snapshot.localId
            );

            result.conflicts++;
            result.stoppedReason =
              'A record changed during synchronization.';
            break;
          }

          if (snapshot.action === 'delete') {

            // A successfully deleted record no longer
            // needs a journal tombstone.
            this.journal.completeDeletion(
              snapshot.recordType,
              snapshot.localId
            );

          } else {

            this.journal.markSynced(
              snapshot.recordType,
              snapshot.localId,
              serverId
            );

          }

          result.synced++;

        } catch (error) {

          if (this.auth.currentUser?.id !== accountId) {
            result.stoppedReason =
              'Account changed during synchronization.';
            break;
          }

          const latest = this.journal.getEntry(
            snapshot.recordType,
            snapshot.localId
          );

          if (
            !latest ||
            latest.updatedAt !== snapshot.updatedAt
          ) {
            result.stoppedReason =
              'A record changed during synchronization.';
            break;
          }

          const status =
            error instanceof HttpErrorResponse
              ? error.status
              : null;

          if (status === 409 || status === 404) {

            // A server conflict or missing mapped
            // record needs explicit reconciliation.
            this.journal.markConflict(
              snapshot.recordType,
              snapshot.localId
            );

            result.conflicts++;
            continue;
          }

          if (status === 401 || status === 403) {
            result.stoppedReason =
              'Authentication was rejected.';
            break;
          }

          // Network failures, timeouts and 5xx errors:
          // leave the entry pending for retry.
          result.stoppedReason =
            'Sync stopped. Pending changes were kept.';
          break;
        }
      }

    } catch (error) {

      console.error(
        'Sync processing failed:',
        error
      );

      result.stoppedReason =
        result.stoppedReason ??
        'Unable to process the sync journal.';

    } finally {

      this.running = false;

      if (this.auth.currentUser?.id === accountId) {
        try {

          result.pending =
            this.journal.getPendingEntries().length;

        } catch {

          result.stoppedReason =
            result.stoppedReason ??
            'Unable to read pending sync entries.';
        }
      }
    }

    return result;
  }

  // ========================================
  // ROUTE RECORD TYPE
  // ========================================

  private async syncOne(
    entry: SyncJournalEntry
  ): Promise<number> {

    if (entry.recordType === 'period') {
      return this.syncPeriod(entry);
    }

    return this.syncWellness(entry);
  }

  // ========================================
  // PERIOD SYNC
  // ========================================

  private async syncPeriod(
    entry: SyncJournalEntry
  ): Promise<number> {

    if (entry.action === 'delete') {

      if (entry.serverId === null) {
        throw new Error(
          'Period deletion requires a server ID.'
        );
      }

      const response = await firstValueFrom(
        this.api.deletePeriod(entry.serverId).pipe(
          timeout(this.requestTimeoutMs)
        )
      );

      if (!response.success) {
        throw new Error('Period deletion failed.');
      }

      return entry.serverId;
    }

    const record = this.periods
      .getRecords()
      .find(item => item.id === entry.localId);

    if (!record) {
      throw new Error(
        'Local period record was not found.'
      );
    }

    const payload = {
      startDate: record.startDate,
      endDate: record.endDate,
      flow: record.flow,
      notes: record.notes,
      clientRecordId: entry.clientRecordId
    };

    if (entry.action === 'create') {

      const response = await firstValueFrom(
        this.api.createPeriod(payload).pipe(
          timeout(this.requestTimeoutMs)
        )
      );

      if (
        !response.success ||
        !Number.isSafeInteger(response.data?.id) ||
        response.data.id <= 0
      ) {
        throw new Error(
          'Invalid period creation response.'
        );
      }

      return response.data.id;
    }

    if (entry.serverId === null) {
      throw new Error(
        'Period update requires a server ID.'
      );
    }

    const response = await firstValueFrom(
      this.api.updatePeriod(
        entry.serverId,
        payload
      ).pipe(
        timeout(this.requestTimeoutMs)
      )
    );

    if (!response.success) {
      throw new Error('Period update failed.');
    }

    return entry.serverId;
  }

  // ========================================
  // WELLNESS SYNC
  // ========================================

  private async syncWellness(
    entry: SyncJournalEntry
  ): Promise<number> {

    if (entry.action === 'delete') {

      if (entry.serverId === null) {
        throw new Error(
          'Wellness deletion requires a server ID.'
        );
      }

      const response = await firstValueFrom(
        this.api.deleteWellness(entry.serverId).pipe(
          timeout(this.requestTimeoutMs)
        )
      );

      if (!response.success) {
        throw new Error('Wellness deletion failed.');
      }

      return entry.serverId;
    }

    const record = this.wellness
      .getRecords()
      .find(item => item.id === entry.localId);

    if (!record) {
      throw new Error(
        'Local wellness record was not found.'
      );
    }

    const payload = {
      date: record.date,
      mood: record.mood,
      symptoms: [...record.symptoms],
      notes: record.notes,
      clientRecordId: entry.clientRecordId
    };

    if (entry.action === 'create') {

      const response = await firstValueFrom(
        this.api.createWellness(payload).pipe(
          timeout(this.requestTimeoutMs)
        )
      );

      if (
        !response.success ||
        !Number.isSafeInteger(response.data?.id) ||
        response.data.id <= 0
      ) {
        throw new Error(
          'Invalid wellness creation response.'
        );
      }

      return response.data.id;
    }

    if (entry.serverId === null) {
      throw new Error(
        'Wellness update requires a server ID.'
      );
    }

    const response = await firstValueFrom(
      this.api.updateWellness(
        entry.serverId,
        payload
      ).pipe(
        timeout(this.requestTimeoutMs)
      )
    );

    if (!response.success) {
      throw new Error('Wellness update failed.');
    }

    return entry.serverId;
  }
}