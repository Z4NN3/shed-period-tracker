
import { NgClass } from '@angular/common';

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
  chevronBackOutline,
  chevronForwardOutline,
  todayOutline,
  heartOutline,
  flowerOutline,
  sparklesOutline,
  informationCircleOutline,
  addCircleOutline,
  arrowForwardOutline,
  timeOutline,
  waterOutline
} from 'ionicons/icons';

import { PeriodService } from '../../services/period';
import { PeriodRecord } from '../../models/period.model';

import {
  calculateCyclePrediction,
  CyclePrediction,
  isValidCycleDate,
  addCycleDays,
  cycleDaysBetween,
  localCycleToday
} from '../../services/cycle-prediction';

type CyclePhase =
  | 'menstruation'
  | 'follicular'
  | 'ovulation'
  | 'luteal';

interface PhaseInfo {
  name: string;
  description: string;
  estimated: boolean;
}

interface PhaseRange {
  name: string;
  start: string;
  end: string;
  cssClass: string;
}

interface CalendarPhase {
  name: string;
  cssClass: CyclePhase;
  description: string;
}

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.page.html',
  styleUrls: ['./calendar.page.scss'],
  standalone: true,
  imports: [
    NgClass,
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
export class CalendarPage implements OnInit, OnDestroy {

  @ViewChild(IonContent)
  private content?: IonContent;

  records: PeriodRecord[] = [];

  private periodSubscription?: Subscription;

  currentMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );

  selectedDate = localCycleToday();

  readonly weekdays = [
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat'
  ];

  readonly phases: CalendarPhase[] = [
    {
      name: 'Menstruation',
      cssClass: 'menstruation',
      description: 'Menstrual bleeding days'
    },
    {
      name: 'Follicular',
      cssClass: 'follicular',
      description: 'Follicle development'
    },
    {
      name: 'Ovulation',
      cssClass: 'ovulation',
      description: 'Estimated egg release'
    },
    {
      name: 'Luteal',
      cssClass: 'luteal',
      description: 'After estimated ovulation'
    }
  ];

  constructor(
    private readonly periodService: PeriodService,
    private readonly cdr: ChangeDetectorRef
  ) {
    addIcons({
      calendarOutline,
      calendarNumberOutline,
      chevronBackOutline,
      chevronForwardOutline,
      todayOutline,
      heartOutline,
      flowerOutline,
      sparklesOutline,
      informationCircleOutline,
      addCircleOutline,
      arrowForwardOutline,
      timeOutline,
      waterOutline
    });
  }

  // ========================================
  // PAGE LIFECYCLE
  // ========================================

  ngOnInit(): void {
    this.periodSubscription =
      this.periodService.records$.subscribe(
        (records: PeriodRecord[]) => {
          this.records = records.map(
            record => ({ ...record })
          );

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
  // TODAY
  // ========================================

  get todayDate(): string {
    return localCycleToday();
  }

  // ========================================
  // SHARED PREDICTION MODEL
  // ========================================

  private get prediction(): CyclePrediction {
    return calculateCyclePrediction(
      this.records,
      this.todayDate
    );
  }

  // ========================================
  // DISPLAY FORMATTING
  // ========================================

  formatDisplayDate(date: string): string {
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

  formatDateRange(
    start: string,
    end: string
  ): string {

    if (start === end) {
      return this.formatDisplayDate(start);
    }

    return (
      this.formatDisplayDate(start) +
      ' – ' +
      this.formatDisplayDate(end)
    );
  }

  // ========================================
  // PERIOD HISTORY
  // ========================================

  get sortedRecords(): PeriodRecord[] {
    return [...this.records].sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate)
    );
  }

  get latestPeriod(): PeriodRecord | null {
    return this.prediction.latestPeriod;
  }

  get averageCycleLength(): number | null {
    return this.prediction.averageCycleLength;
  }

  get averagePeriodDuration(): number | null {
    return this.prediction.averagePeriodDuration;
  }

  get canEstimatePhases(): boolean {
    return this.prediction.status === 'available';
  }

  get estimatedNextPeriod(): string | null {
    return this.prediction.nextPeriodDate;
  }

  // ========================================
  // UNAVAILABLE ESTIMATE MESSAGE
  // ========================================

  get estimateUnavailableMessage(): string {

    switch (this.prediction.status) {

      case 'insufficient':
        return (
          'Log at least two consecutive ' +
          'menstrual periods to begin ' +
          'calculating your cycle pattern.'
        );

      case 'irregular':
        return (
          'Your recorded dates or cycle intervals ' +
          'do not meet the requirements for a ' +
          'reliable estimate.'
        );

      case 'outdated':
        return (
          'Your previous period estimate has ' +
          'already passed without a newer ' +
          'recorded period. Log your latest ' +
          'period to refresh the estimate.'
        );

      case 'available':
        return '';
    }
  }

  // ========================================
  // ACTUAL RECORDED PERIOD
  // ========================================

  getRecordedPeriod(
    date: string
  ): PeriodRecord | null {

    return this.records.find(
      record =>
        date >= record.startDate &&
        date <= record.endDate
    ) ?? null;
  }

  // ========================================
  // CYCLE PHASE FOR A GIVEN DATE
  // ========================================

  getPhase(date: string): CyclePhase | null {

    // Actual saved periods always take priority,
    // even when predictions are unavailable.
    if (this.getRecordedPeriod(date)) {
      return 'menstruation';
    }

    const prediction = this.prediction;

    // IMPORTANT FIX:
    // No estimated colors when the upcoming
    // prediction is missing or outdated.
    if (
      prediction.status !== 'available' ||
      prediction.nextPeriodDate === null ||
      prediction.latestPeriod === null ||
      prediction.averageCycleLength === null ||
      prediction.averagePeriodDuration === null
    ) {
      return null;
    }

    const latest = prediction.latestPeriod;
    const cycleLength =
      prediction.averageCycleLength;
    const duration =
      prediction.averagePeriodDuration;

    const difference = cycleDaysBetween(
      latest.startDate,
      date
    );

    // Only the current modeled cycle and
    // one next cycle are eligible.
    // Do not forecast indefinitely.
    if (
      difference < 0 ||
      difference >= cycleLength * 2
    ) {
      return null;
    }

    const cycleIndex = Math.floor(
      difference / cycleLength
    );

    const cycleDay =
      difference % cycleLength;

    const ovulationIndex =
      cycleLength - 14;

    if (cycleIndex === 0) {

      // Do not invent extra bleeding within
      // the latest recorded period.
      const lastBleedingDay = cycleDaysBetween(
        latest.startDate,
        latest.endDate
      );

      if (cycleDay <= lastBleedingDay) {
        return null;
      }

    } else if (cycleDay < duration) {
      return 'menstruation';
    }

    if (cycleDay < ovulationIndex) {
      return 'follicular';
    }

    if (cycleDay === ovulationIndex) {
      return 'ovulation';
    }

    return 'luteal';
  }

  // ========================================
  // PHASE DETAILS
  // ========================================

  getPhaseInfo(
    date: string
  ): PhaseInfo | null {

    const phase = this.getPhase(date);

    if (!phase) {
      return null;
    }

    const isRecorded =
      this.getRecordedPeriod(date) !== null;

    switch (phase) {

      case 'menstruation':
        return {
          name: 'Menstruation',
          description: isRecorded
            ? 'Recorded menstrual bleeding.'
            : 'Estimated menstrual bleeding days.',
          estimated: !isRecorded
        };

      case 'follicular':
        return {
          name: 'Follicular Phase',
          description:
            'Estimated part of the cycle before ovulation.',
          estimated: true
        };

      case 'ovulation':
        return {
          name: 'Ovulation',
          description:
            'Estimated ovulation day, not confirmed.',
          estimated: true
        };

      case 'luteal':
        return {
          name: 'Luteal Phase',
          description:
            'Estimated part of the cycle after ovulation.',
          estimated: true
        };
    }
  }

  // ========================================
  // SELECTED DATE
  // ========================================

  get selectedPhase(): PhaseInfo | null {
    return this.getPhaseInfo(
      this.selectedDate
    );
  }

  get selectedPeriod(): PeriodRecord | null {
    return this.getRecordedPeriod(
      this.selectedDate
    );
  }

  // ========================================
  // ESTIMATED PHASE RANGES
  // ========================================

  get phaseRanges(): PhaseRange[] {

    const prediction = this.prediction;

    if (
      prediction.status !== 'available' ||
      !prediction.nextPeriodDate ||
      prediction.averageCycleLength === null ||
      prediction.averagePeriodDuration === null
    ) {
      return [];
    }

    const nextStart =
      prediction.nextPeriodDate;

    const cycleLength =
      prediction.averageCycleLength;

    const duration =
      prediction.averagePeriodDuration;

    const ovulationIndex =
      cycleLength - 14;

    return [
      {
        name: 'Menstruation',
        start: nextStart,
        end: addCycleDays(
          nextStart,
          duration - 1
        ),
        cssClass: 'menstruation'
      },
      {
        name: 'Follicular',
        start: addCycleDays(
          nextStart,
          duration
        ),
        end: addCycleDays(
          nextStart,
          ovulationIndex - 1
        ),
        cssClass: 'follicular'
      },
      {
        name: 'Ovulation',
        start: addCycleDays(
          nextStart,
          ovulationIndex
        ),
        end: addCycleDays(
          nextStart,
          ovulationIndex
        ),
        cssClass: 'ovulation'
      },
      {
        name: 'Luteal',
        start: addCycleDays(
          nextStart,
          ovulationIndex + 1
        ),
        end: addCycleDays(
          nextStart,
          cycleLength - 1
        ),
        cssClass: 'luteal'
      }
    ];
  }

  // ========================================
  // MONTH DISPLAY
  // ========================================

  get monthTitle(): string {
    return this.currentMonth.toLocaleDateString(
      'en-US',
      {
        month: 'long',
        year: 'numeric'
      }
    );
  }

  get calendarDays(): (string | null)[] {

    const year =
      this.currentMonth.getFullYear();

    const month =
      this.currentMonth.getMonth();

    const firstDay = new Date(
      year,
      month,
      1
    ).getDay();

    const totalDays = new Date(
      year,
      month + 1,
      0
    ).getDate();

    const days: (string | null)[] =
      Array(firstDay).fill(null);

    for (
      let day = 1;
      day <= totalDays;
      day++
    ) {
      days.push(
        this.formatLocalDate(
          new Date(year, month, day)
        )
      );
    }

    return days;
  }

  private formatLocalDate(
    date: Date
  ): string {

    return [
      date.getFullYear(),
      String(
        date.getMonth() + 1
      ).padStart(2, '0'),
      String(
        date.getDate()
      ).padStart(2, '0')
    ].join('-');
  }

  // ========================================
  // CALENDAR NAVIGATION
  // ========================================

  previousMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
  }

  nextMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
  }

  goToToday(): void {
    const today = new Date();

    this.currentMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );

    this.selectedDate =
      this.formatLocalDate(today);
  }

  selectDate(date: string): void {
    this.selectedDate = date;
  }
}
