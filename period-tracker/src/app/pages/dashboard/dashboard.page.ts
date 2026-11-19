
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
  heartOutline,
  calendarOutline,
  calendarNumberOutline,
  timeOutline,
  analyticsOutline,
  addCircleOutline,
  bookOutline,
  arrowForwardOutline,
  flowerOutline,
  sparklesOutline
} from 'ionicons/icons';

import { PeriodService } from '../../services/period';
import { PeriodRecord } from '../../models/period.model';

import {
  calculateCyclePrediction,
  isValidCycleDate,
  cycleDaysBetween,
  localCycleToday
} from '../../services/cycle-prediction';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
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
export class DashboardPage
  implements OnInit, OnDestroy {

  @ViewChild(IonContent)
  private content?: IonContent;

  records: PeriodRecord[] = [];

  storageMessage = '';

  private periodSubscription?: Subscription;

  constructor(
    private readonly periodService: PeriodService,
    private readonly cdr: ChangeDetectorRef
  ) {
    addIcons({
      heartOutline,
      calendarOutline,
      calendarNumberOutline,
      timeOutline,
      analyticsOutline,
      addCircleOutline,
      bookOutline,
      arrowForwardOutline,
      flowerOutline,
      sparklesOutline
    });
  }

  // ========================================
  // PAGE LIFECYCLE
  // ========================================

  ngOnInit(): void {
    this.periodSubscription =
      this.periodService.records$.subscribe(
        (records: PeriodRecord[]) => {
          this.records = [...records];

          this.storageMessage = '';

          this.cdr.markForCheck();
        }
      );
  }

  ngOnDestroy(): void {
    this.periodSubscription?.unsubscribe();
  }

  ionViewDidEnter(): void {
    void this.content?.scrollToTop(0);
  }

  // ========================================
  // PERIOD RECORDS
  // ========================================

  get sortedRecords(): PeriodRecord[] {
    return [...this.records].sort(
      (a, b) =>
        b.startDate.localeCompare(a.startDate)
    );
  }

  get totalPeriods(): number {
    return this.records.length;
  }

  get latestPeriod(): PeriodRecord | null {
    return this.sortedRecords[0] ?? null;
  }

  // ========================================
  // LATEST PERIOD DURATION
  // ========================================

  get latestPeriodDuration(): number | null {

    const latest = this.latestPeriod;

    if (
      !latest ||
      !isValidCycleDate(latest.startDate) ||
      !isValidCycleDate(latest.endDate) ||
      latest.endDate < latest.startDate
    ) {
      return null;
    }

    return cycleDaysBetween(
      latest.startDate,
      latest.endDate
    ) + 1;
  }

  // ========================================
  // SHARED CYCLE PREDICTION
  // ========================================

  get averageCycleLength(): number | null {
    return calculateCyclePrediction(
      this.records,
      localCycleToday()
    ).averageCycleLength;
  }

  // ========================================
  // DISPLAY DATE
  // ========================================

  formatDate(date: string): string {

    if (!isValidCycleDate(date)) {
      return 'Invalid date';
    }

    return new Date(
      `${date}T00:00:00Z`
    ).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  // ========================================
  // NEXT PERIOD ESTIMATE
  // ========================================

  get nextPeriodDate(): string | null {

    return calculateCyclePrediction(
      this.records,
      localCycleToday()
    ).nextPeriodDate;
  }

  // ========================================
  // DAYS UNTIL NEXT PERIOD
  // ========================================

  get daysUntilPeriod(): number | null {

    const nextDate = this.nextPeriodDate;

    if (!nextDate) {
      return null;
    }

    return cycleDaysBetween(
      localCycleToday(),
      nextDate
    );
  }
}
