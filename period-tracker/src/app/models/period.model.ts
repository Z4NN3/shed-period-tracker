export interface PeriodRecord {
  id: number;
  startDate: string;
  endDate: string;
  flow: 'Light' | 'Medium' | 'Heavy';
  notes: string;
}