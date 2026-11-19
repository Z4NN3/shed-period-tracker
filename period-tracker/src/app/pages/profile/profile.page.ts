
import {
  Component,
  ChangeDetectorRef,
  ViewChild,
  OnInit,
  OnDestroy
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  combineLatest,
  Subscription,
  firstValueFrom,
  timeout
} from 'rxjs';

import {
  HttpErrorResponse
} from '@angular/common/http';

import { AuthService } from '../../services/auth.service';

import {
  ShedApiService,
  ShedUser
} from '../../services/shed-api';

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
  IonIcon
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  personOutline,
  cameraOutline,
  imagesOutline,
  pencilOutline,
  saveOutline,
  closeOutline,
  trashOutline,
  calendarOutline,
  heartOutline,
  bookOutline,
  arrowForwardOutline,
  shieldCheckmarkOutline,
  informationCircleOutline,
  checkmarkCircleOutline,
  sparklesOutline,
  settingsOutline,
  mailOutline,
  lockClosedOutline,
  logOutOutline,
  chevronForwardOutline
} from 'ionicons/icons';

import {
  Camera,
  CameraResultType,
  CameraSource
} from '@capacitor/camera';

import {
  Filesystem,
  Directory
} from '@capacitor/filesystem';

import { PeriodService } from '../../services/period';
import { WellnessService } from '../../services/wellness';

interface ShedProfile {
  displayName: string;
  bio: string;
  photo: string;
  photoFile: string;
}

type SettingsForm = 'email' | 'password' | null;

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
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
export class ProfilePage implements OnInit, OnDestroy {

  // ========================================
  // ACCOUNT AND PROFILE STORAGE
  // ========================================

  private readonly legacyStorageKey =
    'shed.profile.v1';

  private readonly guestStorageKey =
    'shed.profile.guest.v1';

  private readonly accountStoragePrefix =
    'shed.profile.user';

  private activeStorageKey =
    this.guestStorageKey;

  private activeUser: ShedUser | null = null;

  private profileVersion = 0;

  private authSubscription?: Subscription;
  private recordSubscription?: Subscription;

  profile: ShedProfile = this.emptyProfile();

  photoPreview = '';
  isPhotoBusy = false;

  isEditing = false;
  draftName = '';
  draftBio = '';

  // ========================================
  // SETTINGS STATE
  // ========================================

  activeSettingsForm: SettingsForm = null;
  isSettingsBusy = false;

  newEmail = '';
  emailCurrentPassword = '';

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  get accountEmail(): string {
    return this.activeUser?.email ?? '';
  }

  @ViewChild(IonContent)
  private content?: IonContent;

  constructor(
    private readonly periodService: PeriodService,
    private readonly wellnessService: WellnessService,
    private readonly auth: AuthService,
    private readonly api: ShedApiService,
    private readonly alertController: AlertController,
    private readonly toastController: ToastController,
    private readonly cdr: ChangeDetectorRef
  ) {
    addIcons({
      personOutline,
      cameraOutline,
      imagesOutline,
      pencilOutline,
      saveOutline,
      closeOutline,
      trashOutline,
      calendarOutline,
      heartOutline,
      bookOutline,
      arrowForwardOutline,
      shieldCheckmarkOutline,
      informationCircleOutline,
      checkmarkCircleOutline,
      sparklesOutline,
      settingsOutline,
      mailOutline,
      lockClosedOutline,
      logOutOutline,
      chevronForwardOutline
    });
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  ngOnInit(): void {
    this.authSubscription =
      this.auth.currentUser$.subscribe(user => {
        this.switchProfile(user);
      });

    this.recordSubscription = combineLatest([
      this.periodService.records$,
      this.wellnessService.records$
    ]).subscribe(() => {
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.profileVersion++;

    this.authSubscription?.unsubscribe();
    this.recordSubscription?.unsubscribe();
  }

  ionViewDidEnter(): void {
    void this.content?.scrollToTop(0);
  }

  // ========================================
  // PROFILE HELPERS
  // ========================================

  private emptyProfile(): ShedProfile {
    return {
      displayName: '',
      bio: '',
      photo: '',
      photoFile: ''
    };
  }

  private getStorageKey(
    user: ShedUser | null
  ): string {
    if (!user) {
      return this.guestStorageKey;
    }

    return (
      `${this.accountStoragePrefix}.` +
      `${user.id}.v1`
    );
  }

  // ========================================
  // SWITCH ACCOUNT PROFILE
  // ========================================

  private switchProfile(
    user: ShedUser | null
  ): void {

    const newKey = this.getStorageKey(user);

    const accountChanged =
      newKey !== this.activeStorageKey;

    this.activeUser = user;

    if (!accountChanged && this.profileVersion > 0) {
      this.cdr.markForCheck();
      return;
    }

    const version = ++this.profileVersion;

    this.activeStorageKey = newKey;

    this.profile = this.emptyProfile();
    this.photoPreview = '';

    this.isEditing = false;
    this.draftName = '';
    this.draftBio = '';

    this.clearSettingsState();

    this.loadProfile();

    void this.loadSavedPhoto(version);

    this.cdr.markForCheck();
  }

  // ========================================
  // LOAD PROFILE
  // ========================================

  private loadProfile(): void {
    try {
      let stored = localStorage.getItem(
        this.activeStorageKey
      );

      if (
        !stored &&
        this.activeUser === null
      ) {
        stored = localStorage.getItem(
          this.legacyStorageKey
        );
      }

      if (!stored) {
        return;
      }

      const data: unknown = JSON.parse(stored);

      if (
        !data ||
        typeof data !== 'object'
      ) {
        return;
      }

      const value = data as Record<string, unknown>;

      this.profile = {
        displayName:
          typeof value['displayName'] === 'string'
            ? value['displayName']
            : '',

        bio:
          typeof value['bio'] === 'string'
            ? value['bio']
            : '',

        photo:
          typeof value['photo'] === 'string'
            ? value['photo']
            : '',

        photoFile:
          typeof value['photoFile'] === 'string'
            ? value['photoFile']
            : ''
      };

      this.photoPreview = this.profile.photo;

    } catch (error) {
      console.error(
        'Unable to load profile:',
        error
      );
    }
  }

  // ========================================
  // SAVE PROFILE
  // ========================================

  private persistProfile(
    updated: ShedProfile,
    expectedKey: string = this.activeStorageKey
  ): boolean {

    if (expectedKey !== this.activeStorageKey) {
      return false;
    }

    try {
      localStorage.setItem(
        expectedKey,
        JSON.stringify(updated)
      );

      this.profile = { ...updated };

      this.cdr.markForCheck();

      return true;

    } catch (error) {
      console.error(
        'Unable to save profile:',
        error
      );

      return false;
    }
  }

  // ========================================
  // LOAD PROFILE PHOTO
  // ========================================

  private async loadSavedPhoto(
    version: number
  ): Promise<void> {

    const storedPhoto = this.profile.photo;
    const photoFile = this.profile.photoFile;

    if (!photoFile) {
      if (version === this.profileVersion) {
        this.photoPreview = storedPhoto;
        this.cdr.markForCheck();
      }
      return;
    }

    try {
      const result = await Filesystem.readFile({
        path: photoFile,
        directory: Directory.Data
      });

      const base64 = await this.toBase64(
        result.data
      );

      if (version !== this.profileVersion) {
        return;
      }

      this.photoPreview =
        `data:image/jpeg;base64,${base64}`;

    } catch (error) {

      if (version !== this.profileVersion) {
        return;
      }

      console.error(
        'Unable to load profile picture:',
        error
      );

      this.photoPreview = storedPhoto;
    }

    this.cdr.markForCheck();
  }

  private toBase64(
    data: string | Blob
  ): Promise<string> {

    if (typeof data === 'string') {
      return Promise.resolve(data);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        reject(
          new Error('Unable to read stored photo.')
        );
      };

      reader.onload = () => {
        const value = String(reader.result || '');
        resolve(value.split(',')[1] || '');
      };

      reader.readAsDataURL(data);
    });
  }

  // ========================================
  // DISPLAY VALUES
  // ========================================

  get displayName(): string {

    const localName =
      this.profile.displayName.trim();

    if (localName) {
      return localName;
    }

    if (this.activeUser) {
      return this.activeUser.displayName;
    }

    return 'Shed User';
  }

  get displayBio(): string {
    return (
      this.profile.bio.trim() ||
      'Every day is part of your journey.'
    );
  }

  get initials(): string {

    const name = this.displayName;

    if (name === 'Shed User') {
      return 'S';
    }

    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word.charAt(0).toUpperCase())
      .join('');
  }

  get hasPhoto(): boolean {
    return !!(
      this.photoPreview ||
      this.profile.photoFile ||
      this.profile.photo
    );
  }

  // ========================================
  // YOUR JOURNEY
  // ========================================

  get totalPeriods(): number {
    return this.periodService.getRecords().length;
  }

  get totalWellness(): number {
    return this.wellnessService.getRecords().length;
  }

  // ========================================
  // EDIT PROFILE
  // ========================================

  startEditing(): void {
    this.draftName = this.displayName;
    this.draftBio = this.profile.bio;

    this.isEditing = true;

    this.cdr.markForCheck();
  }

  cancelEditing(): void {
    this.draftName = '';
    this.draftBio = '';

    this.isEditing = false;

    this.cdr.markForCheck();
  }

  async saveProfile(): Promise<void> {

    const name = this.draftName.trim();
    const bio = this.draftBio.trim();

    if (name.length < 2 || name.length > 40) {
      await this.showToast(
        'Display name must contain 2–40 characters.',
        'error'
      );
      return;
    }

    if (bio.length > 160) {
      await this.showToast(
        'Bio cannot exceed 160 characters.',
        'error'
      );
      return;
    }

    const success = this.persistProfile({
      ...this.profile,
      displayName: name,
      bio
    });

    if (!success) {
      await this.showToast(
        'Unable to save your profile.',
        'error'
      );
      return;
    }

    this.isEditing = false;

    await this.showToast(
      'Profile updated successfully.'
    );
  }

  // ========================================
  // CAMERA
  // ========================================

  async takeProfilePhoto(): Promise<void> {
    await this.pickPhoto(CameraSource.Camera);
  }

  async chooseProfilePhoto(): Promise<void> {
    await this.pickPhoto(CameraSource.Photos);
  }

  private async pickPhoto(
    source: CameraSource
  ): Promise<void> {

    if (this.isPhotoBusy) {
      return;
    }

    const originalKey = this.activeStorageKey;

    this.isPhotoBusy = true;
    this.cdr.markForCheck();

    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source,
        saveToGallery: false
      });

      if (!photo.webPath) {
        throw new Error(
          'No image was returned.'
        );
      }

      if (originalKey !== this.activeStorageKey) {
        return;
      }

      const file = await this.fetchPhotoFile(
        photo.webPath
      );

      const compressed = await this.compressPhoto(
        file
      );

      await this.savePhotoToFilesystem(
        compressed,
        originalKey
      );

    } catch (error) {
      if (!this.isCancelled(error)) {
        console.error('Photo error:', error);

        await this.showToast(
          'Unable to save profile picture.',
          'error'
        );
      }
    } finally {
      this.isPhotoBusy = false;
      this.cdr.markForCheck();
    }
  }

  // ========================================
  // BROWSER FILE INPUT
  // ========================================

  async onPhotoSelected(
    event: Event
  ): Promise<void> {

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file || this.isPhotoBusy) {
      return;
    }

    const originalKey = this.activeStorageKey;

    this.isPhotoBusy = true;
    this.cdr.markForCheck();

    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Invalid image type.');
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error(
          'Photo must be smaller than 10 MB.'
        );
      }

      const compressed = await this.compressPhoto(
        file
      );

      await this.savePhotoToFilesystem(
        compressed,
        originalKey
      );

    } catch (error) {
      console.error('Photo selection error:', error);

      await this.showToast(
        error instanceof Error
          ? error.message
          : 'Unable to process photo.',
        'error'
      );
    } finally {
      this.isPhotoBusy = false;
      this.cdr.markForCheck();
    }
  }

  // ========================================
  // READ IMAGE FILE
  // ========================================

  private async fetchPhotoFile(
    webPath: string
  ): Promise<File> {

    const response = await fetch(webPath);

    if (!response.ok) {
      throw new Error(
        'Unable to read selected photo.'
      );
    }

    const blob = await response.blob();

    return new File(
      [blob],
      'profile-picture.jpg',
      { type: blob.type || 'image/jpeg' }
    );
  }

  // ========================================
  // COMPRESS IMAGE
  // ========================================

  private compressPhoto(
    file: File
  ): Promise<string> {

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        reject(
          new Error('Unable to read image.')
        );
      };

      reader.onload = () => {
        const image = new Image();

        image.onerror = () => {
          reject(
            new Error('Unable to open image.')
          );
        };

        image.onload = () => {
          try {
            const canvas =
              document.createElement('canvas');

            const size = 320;

            canvas.width = size;
            canvas.height = size;

            const context =
              canvas.getContext('2d');

            if (!context) {
              reject(
                new Error('Canvas is unavailable.')
              );
              return;
            }

            const cropSize = Math.min(
              image.width,
              image.height
            );

            const sourceX =
              (image.width - cropSize) / 2;

            const sourceY =
              (image.height - cropSize) / 2;

            context.drawImage(
              image,
              sourceX,
              sourceY,
              cropSize,
              cropSize,
              0,
              0,
              size,
              size
            );

            resolve(
              canvas.toDataURL(
                'image/jpeg',
                0.78
              )
            );

          } catch (error) {
            reject(error);
          }
        };

        image.src = String(
          reader.result || ''
        );
      };

      reader.readAsDataURL(file);
    });
  }

  // ========================================
  // SAVE PHOTO TO FILESYSTEM
  // ========================================

  private async savePhotoToFilesystem(
    dataUrl: string,
    expectedKey: string
  ): Promise<void> {

    if (expectedKey !== this.activeStorageKey) {
      return;
    }

    const base64 = dataUrl.split(',')[1];

    if (!base64) {
      throw new Error(
        'Unable to encode profile photo.'
      );
    }

    const newPath =
      `shed/profile-${Date.now()}-` +
      `${Math.random().toString(36).slice(2)}.jpg`;

    await Filesystem.writeFile({
      path: newPath,
      data: base64,
      directory: Directory.Data,
      recursive: true
    });

    if (expectedKey !== this.activeStorageKey) {
      return;
    }

    const success = this.persistProfile(
      {
        ...this.profile,
        photo: '',
        photoFile: newPath
      },
      expectedKey
    );

    if (!success) {
      throw new Error(
        'Unable to save profile photo information.'
      );
    }

    this.photoPreview = dataUrl;

    this.cdr.markForCheck();

    await this.showToast(
      'Profile picture updated.'
    );
  }

  // ========================================
  // REMOVE PHOTO
  // ========================================

  async removePhoto(): Promise<void> {

    if (!this.hasPhoto || this.isPhotoBusy) {
      return;
    }

    const expectedKey = this.activeStorageKey;

    const alert = await this.alertController.create({
      header: 'Remove profile picture?',
      message:
        'Your profile picture will be removed from this profile. Your records will not be affected.',
      cssClass: 'shed-delete-alert',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Remove',
          role: 'destructive'
        }
      ]
    });

    await alert.present();

    const result = await alert.onDidDismiss();

    if (result.role !== 'destructive') {
      return;
    }

    if (expectedKey !== this.activeStorageKey) {
      return;
    }

    const success = this.persistProfile(
      {
        ...this.profile,
        photo: '',
        photoFile: ''
      },
      expectedKey
    );

    if (!success) {
      await this.showToast(
        'Unable to remove picture.',
        'error'
      );
      return;
    }

    this.photoPreview = '';
    this.cdr.markForCheck();

    await this.showToast(
      'Profile picture removed.'
    );
  }

  // ========================================
  // CAMERA CANCELLATION
  // ========================================

  private isCancelled(
    error: unknown
  ): boolean {

    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();

    return (
      message.includes('cancel') ||
      message.includes('no image picked') ||
      message.includes('user denied')
    );
  }

  // ========================================
  // SETTINGS HELPERS
  // ========================================

  private clearSettingsState(): void {
    this.activeSettingsForm = null;

    this.newEmail = '';
    this.emailCurrentPassword = '';

    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  toggleSettings(form: 'email' | 'password'): void {
    if (this.isSettingsBusy) {
      return;
    }

    if (this.activeSettingsForm === form) {
      this.clearSettingsState();
    } else {
      this.clearSettingsState();
      this.activeSettingsForm = form;

      if (form === 'email') {
        this.newEmail = this.accountEmail;
      }
    }

    this.cdr.markForCheck();
  }

  closeSettings(): void {
    if (this.isSettingsBusy) {
      return;
    }

    this.clearSettingsState();
    this.cdr.markForCheck();
  }

  private settingsErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const serverMessage: unknown =
        error.error?.message;

      if (
        typeof serverMessage === 'string' &&
        error.status >= 400 &&
        error.status < 500
      ) {
        return serverMessage;
      }

      if (error.status === 0) {
        return 'Cannot connect to the Shed API.';
      }

      return 'Unable to save account settings.';
    }

    return error instanceof Error
      ? error.message
      : 'Unable to save account settings.';
  }

  // ========================================
  // CHANGE EMAIL
  // ========================================

  async saveEmail(): Promise<void> {

    if (this.isSettingsBusy) {
      return;
    }

    const userId = this.activeUser?.id;
    const email = this.newEmail.trim().toLowerCase();

    if (!userId) {
      await this.showToast(
        'Please log in again.',
        'error'
      );
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 191
    ) {
      await this.showToast(
        'Enter a valid email address.',
        'error'
      );
      return;
    }

    if (email === this.accountEmail.toLowerCase()) {
      await this.showToast(
        'Enter a different email address.',
        'error'
      );
      return;
    }

    if (!this.emailCurrentPassword) {
      await this.showToast(
        'Enter your current password.',
        'error'
      );
      return;
    }

    this.isSettingsBusy = true;
    this.cdr.markForCheck();

    try {
      const response = await firstValueFrom(
        this.api.changeEmail({
          newEmail: email,
          currentPassword:
            this.emailCurrentPassword
        }).pipe(timeout(15000))
      );

      if (!response.success) {
        throw new Error('Email change failed.');
      }

      if (this.auth.currentUser?.id !== userId) {
        return;
      }

      await this.auth.refreshCurrentUser();

      this.clearSettingsState();

      await this.showToast(
        'Email address updated successfully.'
      );

    } catch (error) {
      await this.showToast(
        this.settingsErrorMessage(error),
        'error'
      );
    } finally {
      this.isSettingsBusy = false;
      this.cdr.markForCheck();
    }
  }

  // ========================================
  // CHANGE PASSWORD
  // ========================================

  async savePassword(): Promise<void> {

    if (this.isSettingsBusy) {
      return;
    }

    const userId = this.activeUser?.id;

    if (!userId) {
      await this.showToast(
        'Please log in again.',
        'error'
      );
      return;
    }

    if (!this.currentPassword) {
      await this.showToast(
        'Enter your current password.',
        'error'
      );
      return;
    }

    if (
      this.newPassword.length < 12 ||
      this.newPassword.length > 128
    ) {
      await this.showToast(
        'New password must contain 12–128 characters.',
        'error'
      );
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      await this.showToast(
        'New passwords do not match.',
        'error'
      );
      return;
    }

    if (this.newPassword === this.currentPassword) {
      await this.showToast(
        'Choose a different new password.',
        'error'
      );
      return;
    }

    this.isSettingsBusy = true;
    this.cdr.markForCheck();

    try {
      const response = await firstValueFrom(
        this.api.changePassword({
          currentPassword: this.currentPassword,
          newPassword: this.newPassword
        }).pipe(timeout(15000))
      );

      if (!response.success) {
        throw new Error('Password change failed.');
      }

      if (this.auth.currentUser?.id !== userId) {
        return;
      }

      this.clearSettingsState();

      await this.showToast(
        'Password updated successfully.'
      );

    } catch (error) {
      await this.showToast(
        this.settingsErrorMessage(error),
        'error'
      );
    } finally {
      this.isSettingsBusy = false;
      this.cdr.markForCheck();
    }
  }

  // ========================================
  // LOG OUT FROM SETTINGS
  // ========================================

  async logoutFromSettings(): Promise<void> {

    if (this.isSettingsBusy) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Log out of Shed?',
      message:
        'You will return to the Welcome screen. Your saved local records will not be deleted.',
      cssClass: 'shed-delete-alert',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Log Out',
          role: 'confirm'
        }
      ]
    });

    await alert.present();

    const result = await alert.onDidDismiss();

    if (result.role !== 'confirm') {
      return;
    }

    this.isSettingsBusy = true;
    this.clearSettingsState();
    this.cdr.markForCheck();

    try {
      await this.auth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.isSettingsBusy = false;
      this.cdr.markForCheck();
    }
  }

  // ========================================
  // TOAST MESSAGE
  // ========================================

  private async showToast(
    message: string,
    type: 'success' | 'error' = 'success'
  ): Promise<void> {

    const toast = await this.toastController.create({
      message,
      duration: 2400,
      position: 'bottom',
      icon:
        type === 'success'
          ? 'checkmark-circle-outline'
          : 'information-circle-outline',
      cssClass:
        type === 'success'
          ? 'shed-toast-success'
          : 'shed-toast-error'
    });

    await toast.present();
  }
}
