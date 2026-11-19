
import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ViewChild
} from '@angular/core';

import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardContent,
  IonButton,
  IonIcon
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  calendarOutline,
  calendarNumberOutline,
  heartOutline,
  bookOutline,
  waterOutline,
  timeOutline,
  addCircleOutline,
  arrowForwardOutline,
  sparklesOutline,
  leafOutline,
  happyOutline,
  informationCircleOutline,
  documentTextOutline,
  checkmarkCircleOutline
} from 'ionicons/icons';

import { PeriodService } from '../../services/period';
import { WellnessService } from '../../services/wellness';

import { PeriodRecord } from '../../models/period.model';
import { WellnessRecord } from '../../models/wellness.model';

type HistorySection = 'period' | 'wellness';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon
  ]
})
export class HistoryPage implements OnInit, OnDestroy {

  // ========================================
  // SCROLL AND SECTION RESET
  // ========================================

  @ViewChild(IonContent)
  private content?: IonContent;

  ionViewDidEnter(): void {

    // Always open History on Period.
    this.activeSection = 'period';

    // Immediately refresh the selected section.
    this.cdr.detectChanges();

    // Always return to the top.
    void this.content?.scrollToTop(0);

  }

  // ========================================
  // CURRENT SECTION
  // ========================================

  activeSection: HistorySection = 'period';

  // ========================================
  // RECORDS
  // ========================================

  periodRecords: PeriodRecord[] = [];

  wellnessRecords: WellnessRecord[] = [];

  // ========================================
  // SUBSCRIPTIONS
  // ========================================

  private periodSubscription?: Subscription;

  private wellnessSubscription?: Subscription;

  // ========================================
  // CONSTRUCTOR
  // ========================================

  constructor(
    private readonly periodService: PeriodService,
    private readonly wellnessService: WellnessService,
    private readonly cdr: ChangeDetectorRef
  ) {

    addIcons({
      calendarOutline,
      calendarNumberOutline,
      heartOutline,
      bookOutline,
      waterOutline,
      timeOutline,
      addCircleOutline,
      arrowForwardOutline,
      sparklesOutline,
      leafOutline,
      happyOutline,
      informationCircleOutline,
      documentTextOutline,
      checkmarkCircleOutline
    });

  }

  // ========================================
  // INITIALIZE LIVE SYNCHRONIZATION
  // ========================================

  ngOnInit(): void {

    this.periodSubscription =
      this.periodService.records$.subscribe(
        (records: PeriodRecord[]) => {

          this.periodRecords = [...records].sort(
            (a, b) =>
              b.startDate.localeCompare(a.startDate)
          );

          this.cdr.markForCheck();

        }
      );

    this.wellnessSubscription =
      this.wellnessService.records$.subscribe(
        (records: WellnessRecord[]) => {

          this.wellnessRecords = [...records].sort(
            (a, b) =>
              b.date.localeCompare(a.date)
          );

          this.cdr.markForCheck();

        }
      );

  }

  // ========================================
  // CLEAN UP SUBSCRIPTIONS
  // ========================================

  ngOnDestroy(): void {

    this.periodSubscription?.unsubscribe();

    this.wellnessSubscription?.unsubscribe();

  }

  // ========================================
  // SWITCH HISTORY SECTION
  // ========================================

  showSection(section: HistorySection): void {

    this.activeSection = section;

  }

  // ========================================
  // PERIOD RECORD COUNT
  // ========================================

  get totalPeriods(): number {

    return this.periodRecords.length;

  }

  // ========================================
  // WELLNESS ENTRY COUNT
  // ========================================

  get totalWellnessEntries(): number {

    return this.wellnessRecords.length;

  }

  // ========================================
  // FORMAT DATE
  // ========================================

  formatDate(value: string): string {

    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return 'Invalid date';
    }

    const date = new Date(
      value + 'T00:00:00Z'
    );

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      return 'Invalid date';
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });

  }

  // ========================================
  // FORMAT PERIOD DATE RANGE
  // ========================================

  formatDateRange(
    start: string,
    end: string
  ): string {

    if (start === end) {
      return this.formatDate(start);
    }

    return (
      this.formatDate(start) +
      ' – ' +
      this.formatDate(end)
    );

  }

  // ========================================
  // PERIOD DURATION
  // ========================================

  getPeriodDuration(
    record: PeriodRecord
  ): number {

    const start = Date.parse(
      record.startDate + 'T00:00:00Z'
    );

    const end = Date.parse(
      record.endDate + 'T00:00:00Z'
    );

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      end < start
    ) {
      return 0;
    }

    return Math.round(
      (end - start) / 86400000
    ) + 1;

  }

  // ========================================
  // PERIOD FLOW LABEL
  // ========================================

  getFlowClass(
    flow: PeriodRecord['flow']
  ): string {

    switch (flow) {
      case 'Light':
        return 'light';

      case 'Medium':
        return 'medium';

      case 'Heavy':
        return 'heavy';

      default:
        return '';
    }

  }

  // ========================================
  // WELLNESS MOOD ICON
  // ========================================

  getMoodIcon(mood: string): string {

    switch (mood) {

      case 'Happy':
        return 'happy-outline';

      case 'Calm':
        return 'leaf-outline';

      case 'Sad':
        return 'heart-outline';

      case 'Anxious':
        return 'sparkles-outline';

      case 'Irritable':
        return 'water-outline';

      case 'Tired':
        return 'time-outline';

      default:
        return 'heart-outline';

    }

  }

  // ========================================
  // WELLNESS SYMPTOMS
  // ========================================

  getSymptomsLabel(
    record: WellnessRecord
  ): string {

    if (
      !Array.isArray(record.symptoms) ||
      record.symptoms.length === 0
    ) {
      return 'None recorded';
    }

    return record.symptoms.join(', ');

  }

  // ========================================
  // TOTAL RECORD COUNT
  // ========================================

  get totalRecords(): number {

    return (
      this.totalPeriods +
      this.totalWellnessEntries
    );

  }

}
