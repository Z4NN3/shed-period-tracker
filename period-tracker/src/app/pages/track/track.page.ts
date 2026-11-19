
import {
  Component,
  ChangeDetectorRef,
  ViewChild
} from '@angular/core';

import { FormsModule } from '@angular/forms';

import {
  AlertController,
  ToastController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardContent,
  IonButton,
  IonIcon,
  IonTextarea,
  IonDatetime,
  IonModal
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  calendarOutline,
  waterOutline,
  heartOutline,
  happyOutline,
  sunnyOutline,
  cloudOutline,
  moonOutline,
  leafOutline,
  flashOutline,
  pulseOutline,
  medkitOutline,
  bodyOutline,
  sparklesOutline,
  checkmarkCircleOutline,
  createOutline,
  trashOutline,
  addOutline,
  closeOutline,
  saveOutline,
  informationCircleOutline,
  chevronForwardOutline,
  refreshOutline
} from 'ionicons/icons';

import { PeriodService } from '../../services/period';
import { WellnessService } from '../../services/wellness';

import { PeriodRecord } from '../../models/period.model';
import { WellnessRecord } from '../../models/wellness.model';

import { AuthService } from '../../services/auth.service';

import {
  SyncJournalService,
  SyncRecordType
} from '../../services/sync-journal';

type TrackSection = 'period' | 'wellness';
type DateField = 'start' | 'end' | 'wellness';

@Component({
  selector: 'app-track',
  templateUrl: './track.page.html',
  styleUrls: ['./track.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon,
    IonTextarea,
    IonDatetime,
    IonModal
  ]
})
export class TrackPage {

  // ========================================
  // SCROLL AND SECTION RESET
  // ========================================

  @ViewChild(IonContent)
  private content?: IonContent;

  ionViewDidEnter(): void {

    this.activeSection = 'period';

    this.cdr.detectChanges();

    void this.content?.scrollToTop(0);
  }

  // ========================================
  // CURRENT SECTION
  // ========================================

  activeSection: TrackSection = 'period';

  // ========================================
  // PERIOD FORM
  // ========================================

  periodEditingId: number | null = null;

  startDate = '';
  endDate = '';

  flow: PeriodRecord['flow'] | null = null;

  periodNotes = '';

  // ========================================
  // WELLNESS FORM
  // ========================================

  wellnessEditingId: number | null = null;

  wellnessDate = '';

  mood = '';

  selectedSymptoms: string[] = [];

  wellnessNotes = '';

  // ========================================
  // CUSTOM DATE PICKER
  // ========================================

  datePickerOpen: DateField | null = null;

  pendingDate = '';

  // ========================================
  // FLOW OPTIONS
  // ========================================

  readonly flows: {
    value: PeriodRecord['flow'];
    drops: number[];
  }[] = [
    {
      value: 'Light',
      drops: [1]
    },
    {
      value: 'Medium',
      drops: [1, 2]
    },
    {
      value: 'Heavy',
      drops: [1, 2, 3]
    }
  ];

  // ========================================
  // MOOD OPTIONS
  // ========================================

  readonly moods = [
    { name: 'Happy', icon: 'happy-outline' },
    { name: 'Calm', icon: 'leaf-outline' },
    { name: 'Sad', icon: 'cloud-outline' },
    { name: 'Anxious', icon: 'flash-outline' },
    { name: 'Irritable', icon: 'pulse-outline' },
    { name: 'Tired', icon: 'moon-outline' }
  ];

  // ========================================
  // SYMPTOM OPTIONS
  // ========================================

  readonly symptoms = [
    { name: 'Cramps', icon: 'body-outline' },
    { name: 'Headache', icon: 'flash-outline' },
    { name: 'Bloating', icon: 'leaf-outline' },
    { name: 'Fatigue', icon: 'moon-outline' },
    { name: 'Back Pain', icon: 'body-outline' },
    { name: 'Acne', icon: 'sparkles-outline' },
    {
      name: 'Breast Tenderness',
      icon: 'heart-outline'
    },
    { name: 'Nausea', icon: 'medkit-outline' }
  ];

  // ========================================
  // CONSTRUCTOR
  // ========================================

  constructor(
    private periodService: PeriodService,
    private wellnessService: WellnessService,
    private alertController: AlertController,
    private toastController: ToastController,
    private cdr: ChangeDetectorRef,
    private auth: AuthService,
    private syncJournal: SyncJournalService
  ) {

    addIcons({
      calendarOutline,
      waterOutline,
      heartOutline,
      happyOutline,
      sunnyOutline,
      cloudOutline,
      moonOutline,
      leafOutline,
      flashOutline,
      pulseOutline,
      medkitOutline,
      bodyOutline,
      sparklesOutline,
      checkmarkCircleOutline,
      createOutline,
      trashOutline,
      addOutline,
      closeOutline,
      saveOutline,
      informationCircleOutline,
      chevronForwardOutline,
      refreshOutline
    });

  }

  // ========================================
  // SWITCH SECTION
  // ========================================

  showSection(section: TrackSection): void {
    this.activeSection = section;
  }

  // ========================================
  // GET TODAY'S DATE
  // ========================================

  get todayDate(): string {

    const date = new Date();

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  // ========================================
  // NORMALIZE DATE
  // ========================================

  toDateOnly(value: unknown): string {

    return typeof value === 'string'
      ? value.slice(0, 10)
      : '';
  }

  // ========================================
  // FORMAT DATE
  // ========================================

  formatDate(value: string): string {

    const normalized = this.toDateOnly(value);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return 'Select date';
    }

    const date = new Date(
      normalized + 'T00:00:00Z'
    );

    if (Number.isNaN(date.getTime())) {
      return 'Select date';
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  // ========================================
  // OPEN DATE PICKER
  // ========================================

  openDatePicker(field: DateField): void {

    this.datePickerOpen = field;

    this.pendingDate =
      field === 'start'
        ? this.startDate
        : field === 'end'
          ? this.endDate
          : this.wellnessDate;
  }

  // ========================================
  // DATE PICKER CHANGE
  // ========================================

  onPickerDateChange(
    value: string | string[] | null | undefined
  ): void {

    this.pendingDate = this.toDateOnly(value);
  }

  // ========================================
  // CLOSE DATE PICKER
  // ========================================

  closeDatePicker(): void {

    this.datePickerOpen = null;
    this.pendingDate = '';
  }

  // ========================================
  // CONFIRM DATE PICKER
  // ========================================

  confirmDatePicker(): void {

    if (
      !this.pendingDate ||
      this.pendingDate > this.todayDate
    ) {
      return;
    }

    if (this.datePickerOpen === 'start') {
      this.startDate = this.pendingDate;
    }

    if (this.datePickerOpen === 'end') {
      this.endDate = this.pendingDate;
    }

    if (this.datePickerOpen === 'wellness') {
      this.wellnessDate = this.pendingDate;
    }

    this.closeDatePicker();
  }

  // ========================================
  // GET PERIOD RECORDS
  // ========================================

  get periodRecords(): PeriodRecord[] {

    return [...this.periodService.getRecords()]
      .sort(
        (a, b) =>
          b.startDate.localeCompare(a.startDate)
      );
  }

  // ========================================
  // GET WELLNESS RECORDS
  // ========================================

  get wellnessRecords(): WellnessRecord[] {

    return [...this.wellnessService.getRecords()]
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date)
      );
  }

  // ========================================
  // TOGGLE SYMPTOM
  // ========================================

  toggleSymptom(symptom: string): void {

    this.selectedSymptoms =
      this.selectedSymptoms.includes(symptom)
        ? this.selectedSymptoms.filter(
            item => item !== symptom
          )
        : [...this.selectedSymptoms, symptom];
  }

  // ========================================
  // CHECK PERIOD INPUTS
  // ========================================

  get hasPeriodInputs(): boolean {

    return (
      this.startDate !== '' ||
      this.endDate !== '' ||
      this.flow !== null ||
      this.periodNotes.trim().length > 0
    );
  }

  // ========================================
  // CHECK WELLNESS INPUTS
  // ========================================

  get hasWellnessInputs(): boolean {

    return (
      this.wellnessDate !== '' ||
      this.mood !== '' ||
      this.selectedSymptoms.length > 0 ||
      this.wellnessNotes.trim().length > 0
    );
  }

  // ========================================
  // CLEAR PERIOD FORM
  // ========================================

  async clearPeriodForm(): Promise<void> {

    if (this.periodEditingId !== null) {
      return;
    }

    if (!this.hasPeriodInputs) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Clear period form?',
      message:
        'Your unsaved period information will be discarded. Saved period records will not be affected.',
      cssClass: 'shed-delete-alert',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Clear Form',
          role: 'confirm'
        }
      ]
    });

    await alert.present();

    const result = await alert.onDidDismiss();

    if (result.role !== 'confirm') {
      return;
    }

    this.resetPeriodForm();

    this.cdr.detectChanges();
    this.cdr.markForCheck();

    await this.showToast(
      'Period form cleared.'
    );
  }

  // ========================================
  // CLEAR WELLNESS FORM
  // ========================================

  async clearWellnessForm(): Promise<void> {

    if (this.wellnessEditingId !== null) {
      return;
    }

    if (!this.hasWellnessInputs) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Clear wellness form?',
      message:
        'Your unsaved wellness information will be discarded. Saved wellness entries will not be affected.',
      cssClass: 'shed-delete-alert',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Clear Form',
          role: 'confirm'
        }
      ]
    });

    await alert.present();

    const result = await alert.onDidDismiss();

    if (result.role !== 'confirm') {
      return;
    }

    this.resetWellnessForm();

    this.cdr.detectChanges();
    this.cdr.markForCheck();

    await this.showToast(
      'Wellness form cleared.'
    );
  }

  // ========================================
  // TOAST NOTIFICATIONS
  // ========================================

  private async showToast(
    message: string,
    type: 'success' | 'error' = 'success'
  ): Promise<void> {

    const toast = await this.toastController.create({
      message,
      duration: 2700,
      position: 'bottom',
      icon:
        type === 'success'
          ? 'checkmark-circle-outline'
          : 'information-circle-outline',
      cssClass:
        type === 'success'
          ? 'shed-toast-success'
          : 'shed-toast-error',
      buttons: [
        {
          text: 'Close',
          role: 'cancel'
        }
      ]
    });

    await toast.present();
  }

  // ========================================
  // SYNC SAFETY CHECK
  // ========================================

  private assertRecordCanChange(
    recordType: SyncRecordType,
    localId: number
  ): void {

    if (!this.auth.currentUser) {
      return;
    }

    const entry = this.syncJournal.getEntry(
      recordType,
      localId
    );

    if (!entry) {
      // Historical local-only record.
      return;
    }

    if (entry.status === 'conflict') {
      throw new Error(
        'Resolve this record sync conflict first.'
      );
    }

    if (entry.action === 'delete') {
      throw new Error(
        'This record is already pending deletion.'
      );
    }
  }

  // ========================================
  // REGISTER NEW RECORD
  // ========================================

  private async registerNewForSync(
    recordType: SyncRecordType,
    id: number
  ): Promise<void> {

    if (!this.auth.currentUser) {
      return;
    }

    try {

      this.syncJournal.registerNewRecord(
        recordType,
        id
      );

    } catch (error) {

      console.warn(
        'Record saved locally, sync registration failed:',
        error
      );

      await this.showToast(
        'Saved locally, but sync tracking failed.',
        'error'
      );
    }
  }

  // ========================================
  // REGISTER EDIT
  // ========================================

  private async registerEditForSync(
    recordType: SyncRecordType,
    id: number
  ): Promise<void> {

    if (!this.auth.currentUser) {
      return;
    }

    try {

      this.syncJournal.recordEdited(
        recordType,
        id
      );

    } catch (error) {

      console.warn(
        'Edit saved locally, sync tracking failed:',
        error
      );

      await this.showToast(
        'Updated locally, but sync tracking failed.',
        'error'
      );
    }
  }

  // ========================================
  // REGISTER DELETE
  // ========================================

  private async registerDeleteForSync(
    recordType: SyncRecordType,
    id: number
  ): Promise<void> {

    if (!this.auth.currentUser) {
      return;
    }

    try {

      this.syncJournal.recordDeleted(
        recordType,
        id
      );

    } catch (error) {

      console.warn(
        'Delete saved locally, sync tracking failed:',
        error
      );

      await this.showToast(
        'Deleted locally, but sync tracking failed.',
        'error'
      );
    }
  }

  // ========================================
  // SAVE OR UPDATE PERIOD
  // ========================================

  async savePeriod(): Promise<void> {

    try {

      if (!this.flow) {

        await this.showToast(
          'Please select your flow intensity.',
          'error'
        );

        return;
      }

      const data: Omit<PeriodRecord, 'id'> = {
        startDate: this.toDateOnly(this.startDate),
        endDate: this.toDateOnly(this.endDate),
        flow: this.flow,
        notes: this.periodNotes
      };

      const editing =
        this.periodEditingId !== null;

      if (this.periodEditingId !== null) {

        const id = this.periodEditingId;

        this.assertRecordCanChange('period', id);

        this.periodService.updateRecord(
          id,
          data
        );

        await this.registerEditForSync(
          'period',
          id
        );

      } else {

        const created =
          this.periodService.addRecord(data);

        await this.registerNewForSync(
          'period',
          created.id
        );
      }

      this.resetPeriodForm();

      this.cdr.markForCheck();

      await this.showToast(
        editing
          ? 'Period record updated.'
          : 'Period record saved.'
      );

    } catch (error) {

      await this.showToast(
        error instanceof Error
          ? error.message
          : 'Unable to save period record.',
        'error'
      );
    }
  }

  // ========================================
  // EDIT PERIOD
  // ========================================

  editPeriod(record: PeriodRecord): void {

    this.showSection('period');

    this.periodEditingId = record.id;

    this.startDate = record.startDate;
    this.endDate = record.endDate;

    this.flow = record.flow;
    this.periodNotes = record.notes;

    this.cdr.markForCheck();
  }

  // ========================================
  // DELETE PERIOD
  // ========================================

  async deletePeriod(id: number): Promise<void> {

    try {

      const alert = await this.alertController.create({
        header: 'Delete period record?',
        message:
          'This entry will be permanently removed.',
        cssClass: 'shed-delete-alert',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel'
          },
          {
            text: 'Delete',
            role: 'destructive'
          }
        ]
      });

      await alert.present();

      const result = await alert.onDidDismiss();

      if (result.role !== 'destructive') {
        return;
      }

      this.assertRecordCanChange('period', id);

      this.periodService.deleteRecord(id);

      // For an unsynced creation this removes
      // its journal entry.
      // For a mapped server record it keeps a
      // pending deletion tombstone.
      await this.registerDeleteForSync(
        'period',
        id
      );

      if (this.periodEditingId === id) {
        this.resetPeriodForm();
      }

      this.cdr.detectChanges();
      this.cdr.markForCheck();

      await this.showToast(
        'Period record deleted.'
      );

    } catch (error) {

      await this.showToast(
        error instanceof Error
          ? error.message
          : 'Unable to delete period record.',
        'error'
      );
    }
  }

  // ========================================
  // RESET PERIOD FORM
  // ========================================

  resetPeriodForm(): void {

    this.periodEditingId = null;

    this.startDate = '';
    this.endDate = '';

    this.flow = null;

    this.periodNotes = '';
  }

  // ========================================
  // SAVE OR UPDATE WELLNESS
  // ========================================

  async saveWellness(): Promise<void> {

    try {

      if (!this.mood) {

        await this.showToast(
          'Please select how you are feeling.',
          'error'
        );

        return;
      }

      const data: Omit<WellnessRecord, 'id'> = {
        date: this.toDateOnly(this.wellnessDate),
        mood: this.mood,
        symptoms: [...this.selectedSymptoms],
        notes: this.wellnessNotes
      };

      const editing =
        this.wellnessEditingId !== null;

      if (this.wellnessEditingId !== null) {

        const id = this.wellnessEditingId;

        this.assertRecordCanChange('wellness', id);

        this.wellnessService.updateRecord(
          id,
          data
        );

        await this.registerEditForSync(
          'wellness',
          id
        );

      } else {

        const created =
          this.wellnessService.addRecord(data);

        await this.registerNewForSync(
          'wellness',
          created.id
        );
      }

      this.resetWellnessForm();

      this.cdr.markForCheck();

      await this.showToast(
        editing
          ? 'Wellness entry updated.'
          : 'Wellness entry saved.'
      );

    } catch (error) {

      await this.showToast(
        error instanceof Error
          ? error.message
          : 'Unable to save wellness entry.',
        'error'
      );
    }
  }

  // ========================================
  // EDIT WELLNESS
  // ========================================

  editWellness(record: WellnessRecord): void {

    this.showSection('wellness');

    this.wellnessEditingId = record.id;

    this.wellnessDate = record.date;
    this.mood = record.mood;

    this.selectedSymptoms = [
      ...record.symptoms
    ];

    this.wellnessNotes = record.notes;

    this.cdr.markForCheck();
  }

  // ========================================
  // DELETE WELLNESS
  // ========================================

  async deleteWellness(id: number): Promise<void> {

    try {

      const alert = await this.alertController.create({
        header: 'Delete wellness entry?',
        message:
          'This entry will be permanently removed.',
        cssClass: 'shed-delete-alert',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel'
          },
          {
            text: 'Delete',
            role: 'destructive'
          }
        ]
      });

      await alert.present();

      const result = await alert.onDidDismiss();

      if (result.role !== 'destructive') {
        return;
      }

      this.assertRecordCanChange('wellness', id);

      this.wellnessService.deleteRecord(id);

      await this.registerDeleteForSync(
        'wellness',
        id
      );

      if (this.wellnessEditingId === id) {
        this.resetWellnessForm();
      }

      this.cdr.detectChanges();
      this.cdr.markForCheck();

      await this.showToast(
        'Wellness entry deleted.'
      );

    } catch (error) {

      await this.showToast(
        error instanceof Error
          ? error.message
          : 'Unable to delete wellness entry.',
        'error'
      );
    }
  }

  // ========================================
  // RESET WELLNESS FORM
  // ========================================

  resetWellnessForm(): void {

    this.wellnessEditingId = null;

    this.wellnessDate = '';

    this.mood = '';

    this.selectedSymptoms = [];

    this.wellnessNotes = '';
  }

}