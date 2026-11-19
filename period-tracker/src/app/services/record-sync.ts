
import { Injectable } from '@angular/core';
import {
  Observable,
  defer,
  forkJoin,
  map
} from 'rxjs';

import { PeriodRecord } from '../models/period.model';
import { WellnessRecord } from '../models/wellness.model';

import { PeriodService } from './period';
import { WellnessService } from './wellness';
import { ShedApiService } from './shed-api';

// ========================================
// COMPARISON MODELS
// ========================================

export type ReviewStatus =
  | 'exact'
  | 'overlap'
  | 'local-only'
  | 'server-only';

export interface RecordMatchSummary {
  exactMatches: number;
  localOnly: number;
  serverOnly: number;
  possibleOverlaps: number;
}

export interface DuplicateGroup {
  recordIds: number[];
  description: string;
  total: number;
}

export interface RecordReviewItem {
  status: ReviewStatus;
  localId: number | null;
  serverId: number | null;
  localDescription: string;
  serverDescription: string;
}

export interface RecordComparison {
  localPeriods: number;
  serverPeriods: number;

  localWellness: number;
  serverWellness: number;

  localTotal: number;
  serverTotal: number;

  hasLocalRecords: boolean;
  hasServerRecords: boolean;

  periodAnalysis: RecordMatchSummary;
  wellnessAnalysis: RecordMatchSummary;

  analyzedLocalPeriods: number;
  analyzedLocalWellness: number;

  localPeriodDuplicates: DuplicateGroup[];
  localWellnessDuplicates: DuplicateGroup[];

  periodReview: RecordReviewItem[];
  wellnessReview: RecordReviewItem[];
}

interface RecordAnalysis {
  summary: RecordMatchSummary;
  rows: RecordReviewItem[];
}

interface IdentifiedRecord {
  id: number;
}

// ========================================
// RECORD SYNC SERVICE
// PHASE 3.2 - READ ONLY
// ========================================

@Injectable({
  providedIn: 'root'
})
export class RecordSyncService {

  constructor(
    private readonly periodService: PeriodService,
    private readonly wellnessService: WellnessService,
    private readonly shedApi: ShedApiService
  ) {}

  // ========================================
  // LOCAL COUNTS
  // ========================================

  getLocalCounts(): {
    periods: number;
    wellness: number;
  } {
    return {
      periods: this.periodService.getRecords().length,
      wellness: this.wellnessService.getRecords().length
    };
  }

  // ========================================
  // NORMALIZATION
  // ========================================

  private normalizeNotes(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private normalizeSymptoms(
    symptoms: string[]
  ): string[] {
    return symptoms
      .map(value => value.trim())
      .sort();
  }

  // ========================================
  // PERIOD MATCHING
  // ========================================

  private periodKey(
    record: PeriodRecord
  ): string {
    return JSON.stringify([
      record.startDate,
      record.endDate,
      record.flow,
      this.normalizeNotes(record.notes)
    ]);
  }

  private periodOverlapKey(
    record: PeriodRecord
  ): string {
    return JSON.stringify([
      record.startDate,
      record.endDate
    ]);
  }

  private describePeriod(
    record: PeriodRecord
  ): string {
    const dates =
      `${record.startDate} to ${record.endDate}`;

    const notes =
      this.normalizeNotes(record.notes);

    return [
      dates,
      `Flow: ${record.flow}`,
      notes ? `Notes: ${notes}` : 'No notes'
    ].join(' | ');
  }

  // ========================================
  // WELLNESS MATCHING
  // ========================================

  private wellnessKey(
    record: WellnessRecord
  ): string {
    return JSON.stringify([
      record.date,
      record.mood,
      this.normalizeSymptoms(record.symptoms),
      this.normalizeNotes(record.notes)
    ]);
  }

  private wellnessOverlapKey(
    record: WellnessRecord
  ): string {
    return record.date;
  }

  private describeWellness(
    record: WellnessRecord
  ): string {
    const symptoms =
      this.normalizeSymptoms(record.symptoms);

    const notes =
      this.normalizeNotes(record.notes);

    return [
      record.date,
      `Mood: ${record.mood}`,
      symptoms.length
        ? `Symptoms: ${symptoms.join(', ')}`
        : 'No symptoms',
      notes ? `Notes: ${notes}` : 'No notes'
    ].join(' | ');
  }

  // ========================================
  // LOCAL DUPLICATE DETECTION
  // ========================================

  private findLocalDuplicates<T extends IdentifiedRecord>(
    records: T[],
    getKey: (record: T) => string,
    describe: (record: T) => string
  ): DuplicateGroup[] {

    const groups = new Map<string, T[]>();

    for (const record of records) {
      const key = getKey(record);

      const group = groups.get(key) ?? [];
      group.push(record);
      groups.set(key, group);
    }

    const duplicates: DuplicateGroup[] = [];

    for (const group of groups.values()) {
      if (group.length < 2) {
        continue;
      }

      duplicates.push({
        recordIds: group.map(record => record.id),
        description: describe(group[0]),
        total: group.length
      });
    }

    return duplicates;
  }

  // ========================================
  // RECORD-BY-RECORD ANALYSIS
  // ========================================

  private analyzeRecords<T extends IdentifiedRecord>(
    local: T[],
    server: T[],
    getExactKey: (record: T) => string,
    getOverlapKey: (record: T) => string,
    describe: (record: T) => string
  ): RecordAnalysis {

    const usedServer = new Set<number>();
    const usedLocal = new Set<number>();

    const rows: RecordReviewItem[] = [];

    let exactMatches = 0;
    let possibleOverlaps = 0;
    let localOnly = 0;
    let serverOnly = 0;

    // STEP 1: Exact content matches, one-to-one.
    for (let i = 0; i < local.length; i++) {
      const localRecord = local[i];

      const matchIndex = server.findIndex(
        (serverRecord, index) =>
          !usedServer.has(index) &&
          getExactKey(serverRecord) ===
            getExactKey(localRecord)
      );

      if (matchIndex === -1) {
        continue;
      }

      const serverRecord = server[matchIndex];

      usedLocal.add(i);
      usedServer.add(matchIndex);
      exactMatches++;

      rows.push({
        status: 'exact',
        localId: localRecord.id,
        serverId: serverRecord.id,
        localDescription: describe(localRecord),
        serverDescription: describe(serverRecord)
      });
    }

    // STEP 2: Same date or date range,
    // but different record contents.
    for (let i = 0; i < local.length; i++) {
      if (usedLocal.has(i)) {
        continue;
      }

      const localRecord = local[i];

      const matchIndex = server.findIndex(
        (serverRecord, index) =>
          !usedServer.has(index) &&
          getOverlapKey(serverRecord) ===
            getOverlapKey(localRecord)
      );

      if (matchIndex === -1) {
        continue;
      }

      const serverRecord = server[matchIndex];

      usedLocal.add(i);
      usedServer.add(matchIndex);
      possibleOverlaps++;

      rows.push({
        status: 'overlap',
        localId: localRecord.id,
        serverId: serverRecord.id,
        localDescription: describe(localRecord),
        serverDescription: describe(serverRecord)
      });
    }

    // STEP 3: Records found locally only.
    for (let i = 0; i < local.length; i++) {
      if (usedLocal.has(i)) {
        continue;
      }

      localOnly++;

      rows.push({
        status: 'local-only',
        localId: local[i].id,
        serverId: null,
        localDescription: describe(local[i]),
        serverDescription: ''
      });
    }

    // STEP 4: Records found on server only.
    for (let i = 0; i < server.length; i++) {
      if (usedServer.has(i)) {
        continue;
      }

      serverOnly++;

      rows.push({
        status: 'server-only',
        localId: null,
        serverId: server[i].id,
        localDescription: '',
        serverDescription: describe(server[i])
      });
    }

    return {
      summary: {
        exactMatches,
        localOnly,
        serverOnly,
        possibleOverlaps
      },
      rows
    };
  }

  // ========================================
  // READ-ONLY LOCAL / SERVER COMPARISON
  // ========================================

  compareRecords(): Observable<RecordComparison> {

    return defer(() => {

      if (!this.shedApi.isAuthenticated()) {
        throw new Error(
          'Please log in before comparing records.'
        );
      }

      // Snapshot of the current account's
      // local records.
      const localPeriods =
        this.periodService.getRecords();

      const localWellness =
        this.wellnessService.getRecords();

      // Local duplicate detection.
      // No records are modified.
      const localPeriodDuplicates =
        this.findLocalDuplicates(
          localPeriods,
          record => this.periodKey(record),
          record => this.describePeriod(record)
        );

      const localWellnessDuplicates =
        this.findLocalDuplicates(
          localWellness,
          record => this.wellnessKey(record),
          record => this.describeWellness(record)
        );

      // Authenticated GET requests only.
      return forkJoin({
        periods: this.shedApi.getPeriods(),
        wellness: this.shedApi.getWellnessRecords()
      }).pipe(

        map(({ periods, wellness }) => {

          if (
            !periods.success ||
            !wellness.success ||
            !Array.isArray(periods.data) ||
            !Array.isArray(wellness.data)
          ) {
            throw new Error(
              'Invalid server record response.'
            );
          }

          const serverPeriods = periods.data;
          const serverWellness = wellness.data;

          // Period analysis.
          const periodResult = this.analyzeRecords(
            localPeriods,
            serverPeriods,
            record => this.periodKey(record),
            record => this.periodOverlapKey(record),
            record => this.describePeriod(record)
          );

          // Wellness analysis.
          const wellnessResult = this.analyzeRecords(
            localWellness,
            serverWellness,
            record => this.wellnessKey(record),
            record => this.wellnessOverlapKey(record),
            record => this.describeWellness(record)
          );

          return {
            localPeriods: localPeriods.length,
            serverPeriods: serverPeriods.length,

            localWellness: localWellness.length,
            serverWellness: serverWellness.length,

            localTotal:
              localPeriods.length +
              localWellness.length,

            serverTotal:
              serverPeriods.length +
              serverWellness.length,

            hasLocalRecords:
              localPeriods.length +
              localWellness.length > 0,

            hasServerRecords:
              serverPeriods.length +
              serverWellness.length > 0,

            periodAnalysis: periodResult.summary,
            wellnessAnalysis: wellnessResult.summary,

            analyzedLocalPeriods:
              localPeriods.length,

            analyzedLocalWellness:
              localWellness.length,

            localPeriodDuplicates,
            localWellnessDuplicates,

            periodReview: periodResult.rows,
            wellnessReview: wellnessResult.rows
          };
        })
      );
    });
  }
}
