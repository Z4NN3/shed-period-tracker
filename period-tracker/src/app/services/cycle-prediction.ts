
import { PeriodRecord } from '../models/period.model';

export type PredictionStatus =
  | 'available'
  | 'insufficient'
  | 'irregular'
  | 'outdated';

export interface CyclePrediction {
  status: PredictionStatus;
  averageCycleLength: number | null;
  averagePeriodDuration: number | null;
  latestPeriod: PeriodRecord | null;
  nextPeriodDate: string | null;
}

export function isValidCycleDate(
  value: unknown
): value is string {

  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(
    `${value}T00:00:00Z`
  );

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function addCycleDays(
  dateString: string,
  days: number
): string {

  const date = new Date(
    `${dateString}T00:00:00Z`
  );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date.toISOString().slice(0, 10);
}

export function cycleDaysBetween(
  start: string,
  end: string
): number {

  const first = Date.parse(
    `${start}T00:00:00Z`
  );

  const last = Date.parse(
    `${end}T00:00:00Z`
  );

  return Math.round(
    (last - first) / 86400000
  );
}

export function localCycleToday(): string {

  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

export function calculateCyclePrediction(
  records: PeriodRecord[],
  today: string = localCycleToday()
): CyclePrediction {

  const ordered = [...records].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate)
  );

  const latestPeriod =
    ordered[ordered.length - 1] ?? null;

  const result: CyclePrediction = {
    status: 'insufficient',
    averageCycleLength: null,
    averagePeriodDuration: null,
    latestPeriod,
    nextPeriodDate: null
  };

  // A single period gives no cycle interval.
  if (ordered.length < 2) {
    return result;
  }

  // Invalid or future-dated records must not
  // create a forecast.
  const invalidRecord = ordered.some(record =>
    !isValidCycleDate(record.startDate) ||
    !isValidCycleDate(record.endDate) ||
    record.endDate < record.startDate ||
    record.startDate > today
  );

  if (invalidRecord) {
    return {
      ...result,
      status: 'irregular'
    };
  }

  const intervals: number[] = [];

  for (let index = 1; index < ordered.length; index++) {

    const interval = cycleDaysBetween(
      ordered[index - 1].startDate,
      ordered[index].startDate
    );

    intervals.push(interval);
  }

  // Conservative model eligibility:
  // recorded start-to-start intervals must
  // be within 21 to 35 days.
  if (
    intervals.some(
      interval => interval < 21 || interval > 35
    )
  ) {
    return {
      ...result,
      status: 'irregular'
    };
  }

  const shortest = Math.min(...intervals);
  const longest = Math.max(...intervals);

  if (longest - shortest > 7) {
    return {
      ...result,
      status: 'irregular'
    };
  }

  const averageCycleLength = Math.round(
    intervals.reduce(
      (sum, interval) => sum + interval,
      0
    ) / intervals.length
  );

  const durations = ordered.map(record =>
    cycleDaysBetween(
      record.startDate,
      record.endDate
    ) + 1
  );

  const averagePeriodDuration = Math.round(
    durations.reduce(
      (sum, duration) => sum + duration,
      0
    ) / durations.length
  );

  const calculated: CyclePrediction = {
    ...result,
    averageCycleLength,
    averagePeriodDuration,
    status: 'irregular'
  };

  // Reject implausible bleeding durations.
  if (
    durations.some(
      duration => duration < 2 || duration > 8
    ) ||
    averagePeriodDuration >= averageCycleLength - 14
  ) {
    return calculated;
  }

  const latest = latestPeriod!;

  const nextDate = addCycleDays(
    latest.startDate,
    averageCycleLength
  );

  const age = cycleDaysBetween(
    latest.startDate,
    today
  );

  if (
    age < 0 ||
    age > averageCycleLength * 2 ||
    nextDate < today
  ) {
    return {
      ...calculated,
      status: 'outdated'
    };
  }

  return {
    ...calculated,
    status: 'available',
    nextPeriodDate: nextDate
  };
}
