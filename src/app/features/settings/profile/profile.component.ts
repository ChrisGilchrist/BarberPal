import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PushNotificationService } from '../../../core/services/push-notification.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  pushService = inject(PushNotificationService);

  profileForm: FormGroup;
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.profileForm = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      email: [{ value: '', disabled: true }],
      phone: ['']
    });
  }

  ngOnInit() {
    this.loadProfile();
  }

  async loadProfile() {
    this.loading.set(true);
    try {
      const user = this.authService.currentUser();
      if (user) {
        this.profileForm.patchValue({
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email || '',
          phone: user.phone || ''
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      this.error.set('Failed to load profile');
    } finally {
      this.loading.set(false);
    }
  }

  async saveProfile() {
    if (this.profileForm.invalid) return;

    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const formData = this.profileForm.getRawValue();
      await this.authService.updateProfile({
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone
      });
      this.success.set('Profile updated successfully');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      this.error.set(error.message || 'Failed to save profile');
    } finally {
      this.saving.set(false);
    }
  }

  async togglePushNotifications(): Promise<void> {
    this.error.set(null);
    this.success.set(null);

    if (this.pushService.isSubscribed()) {
      const result = await this.pushService.unsubscribe();
      if (result) {
        this.success.set('Push notifications disabled');
      } else {
        this.error.set('Failed to disable push notifications');
      }
    } else {
      const result = await this.pushService.subscribe();
      if (result) {
        this.success.set('Push notifications enabled');
      } else if (this.pushService.permissionState() === 'denied') {
        this.error.set('Notifications blocked. Please enable in browser settings.');
      } else {
        this.error.set('Failed to enable push notifications');
      }
    }
  }

  async sendTestNotification(): Promise<void> {
    await this.pushService.sendTestNotification();
    this.success.set('Test notification sent!');
  }

  async refreshPushSubscription(): Promise<void> {
    this.error.set(null);
    this.success.set(null);

    // Unsubscribe first, then resubscribe
    await this.pushService.unsubscribe();
    const result = await this.pushService.subscribe();
    if (result) {
      this.success.set('Push subscription refreshed! You should now receive notifications.');
    } else {
      this.error.set('Failed to refresh push subscription');
    }
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }

  getRoleLabel(): string {
    const user = this.authService.currentUser();
    switch (user?.role) {
      case 'owner': return 'Owner/Admin';
      case 'staff': return 'Staff Member';
      case 'client': return 'Client';
      default: return 'User';
    }
  }
}
