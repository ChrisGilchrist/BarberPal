import { Component, OnInit, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { DayOfWeek } from '../../core/models';

interface DayConfig {
  day: DayOfWeek;
  name: string;
  isActive: boolean;
  startTime: string;
  endTime: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private supabase = inject(SupabaseService);
  pushService = inject(PushNotificationService);

  activeTab = signal<'business' | 'hours' | 'invite' | 'notifications'>('business');

  // Client notification settings
  clientNotificationsEnabled = signal(true);
  reminderHours = signal(24);

  // Business info
  businessName = '';
  businessAddress = '';
  businessPhone = '';
  bufferMinutes = 10;

  // Invite link
  inviteLink = computed(() => {
    const user = this.authService.user();
    if (!user?.id) return '';
    const baseUrl = isPlatformBrowser(this.platformId) ? window.location.origin : '';
    return `${baseUrl}/invite/${user.id}`;
  });
  linkCopied = signal(false);

  // Working hours
  workingHours = signal<DayConfig[]>([
    { day: 0, name: 'Sunday', isActive: false, startTime: '09:00', endTime: '17:00' },
    { day: 1, name: 'Monday', isActive: true, startTime: '09:00', endTime: '18:00' },
    { day: 2, name: 'Tuesday', isActive: true, startTime: '09:00', endTime: '18:00' },
    { day: 3, name: 'Wednesday', isActive: true, startTime: '09:00', endTime: '18:00' },
    { day: 4, name: 'Thursday', isActive: true, startTime: '09:00', endTime: '18:00' },
    { day: 5, name: 'Friday', isActive: true, startTime: '09:00', endTime: '18:00' },
    { day: 6, name: 'Saturday', isActive: true, startTime: '10:00', endTime: '16:00' },
  ]);

  isLoading = signal(false);
  isSaving = signal(false);
  message = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  constructor(
    public authService: AuthService,
    private businessService: BusinessService
  ) {}

  async ngOnInit() {
    await this.loadBusinessData();
  }

  async loadBusinessData() {
    this.isLoading.set(true);
    const user = this.authService.user();

    if (user?.business_id) {
      const { data } = await this.businessService.loadBusiness(user.business_id);
      if (data) {
        this.businessName = data.name;
        this.businessAddress = data.address;
        this.businessPhone = data.phone;
        this.bufferMinutes = data.buffer_minutes;
      }

      // Load working hours for the owner
      const { data: hoursData } = await this.businessService.getWorkingHours(user.id);
      if (hoursData && hoursData.length > 0) {
        this.workingHours.update(hours =>
          hours.map(h => {
            const saved = hoursData.find(wh => wh.day_of_week === h.day);
            if (saved) {
              return {
                ...h,
                isActive: saved.is_active,
                startTime: saved.start_time,
                endTime: saved.end_time
              };
            }
            return h;
          })
        );
      } else {
        // No working hours exist - auto-save the defaults for existing barbers
        await this.initializeDefaultWorkingHours(user.id);
      }
    }

    this.isLoading.set(false);
  }

  setActiveTab(tab: 'business' | 'hours' | 'invite' | 'notifications') {
    this.activeTab.set(tab);
    this.message.set(null);
    this.linkCopied.set(false);
  }

  async copyInviteLink() {
    const link = this.inviteLink();
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }

  async saveBusinessInfo() {
    this.isSaving.set(true);
    this.message.set(null);

    try {
      const user = this.authService.user();
      if (!user?.business_id) {
        throw new Error('No business found');
      }

      const { error } = await this.businessService.updateBusiness(user.business_id, {
        name: this.businessName,
        address: this.businessAddress,
        phone: this.businessPhone,
        buffer_minutes: this.bufferMinutes
      });

      if (error) throw new Error(error);

      this.message.set({ type: 'success', text: 'Business information saved successfully!' });
    } catch (error: any) {
      this.message.set({ type: 'error', text: error.message || 'Failed to save' });
    }

    this.isSaving.set(false);
  }

  async saveWorkingHours() {
    this.isSaving.set(true);
    this.message.set(null);

    try {
      const user = this.authService.user();
      if (!user) throw new Error('Not authenticated');

      const hours = this.workingHours().map(h => ({
        user_id: user.id,
        day_of_week: h.day,
        start_time: h.startTime,
        end_time: h.endTime,
        is_active: h.isActive
      }));

      const { error } = await this.businessService.setWorkingHours(user.id, hours);

      if (error) throw new Error(error);

      this.message.set({ type: 'success', text: 'Working hours saved successfully!' });
    } catch (error: any) {
      this.message.set({ type: 'error', text: error.message || 'Failed to save' });
    }

    this.isSaving.set(false);
  }

  toggleDay(index: number) {
    this.workingHours.update(hours => {
      const updated = [...hours];
      updated[index] = { ...updated[index], isActive: !updated[index].isActive };
      return updated;
    });
  }

  updateDayTime(index: number, field: 'startTime' | 'endTime', value: string) {
    this.workingHours.update(hours => {
      const updated = [...hours];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  private async initializeDefaultWorkingHours(userId: string) {
    const hours = this.workingHours().map(h => ({
      user_id: userId,
      day_of_week: h.day,
      start_time: h.startTime,
      end_time: h.endTime,
      is_active: h.isActive
    }));

    await this.businessService.setWorkingHours(userId, hours);
  }

  // Push Notification Methods
  async togglePushNotifications(): Promise<void> {
    if (this.pushService.isSubscribed()) {
      const success = await this.pushService.unsubscribe();
      if (success) {
        this.message.set({ type: 'success', text: 'Push notifications disabled' });
      } else {
        this.message.set({ type: 'error', text: 'Failed to disable push notifications' });
      }
    } else {
      const success = await this.pushService.subscribe();
      if (success) {
        this.message.set({ type: 'success', text: 'Push notifications enabled' });
      } else if (this.pushService.permissionState() === 'denied') {
        this.message.set({ type: 'error', text: 'Notifications blocked. Please enable in browser settings.' });
      } else {
        this.message.set({ type: 'error', text: 'Failed to enable push notifications' });
      }
    }
  }

  async sendTestNotification(): Promise<void> {
    await this.pushService.sendTestNotification();
    this.message.set({ type: 'success', text: 'Test notification sent!' });
  }

  async updateReminderHours(hours: number): Promise<void> {
    this.isSaving.set(true);
    try {
      const user = this.authService.user();
      if (!user) throw new Error('Not authenticated');

      await this.supabase.from('users').update({ reminder_hours: hours }).eq('id', user.id);
      this.reminderHours.set(hours);
      this.message.set({ type: 'success', text: 'Reminder timing updated' });
    } catch (error: any) {
      this.message.set({ type: 'error', text: error.message || 'Failed to update' });
    }
    this.isSaving.set(false);
  }

  async toggleClientNotifications(): Promise<void> {
    this.isSaving.set(true);
    const newValue = !this.clientNotificationsEnabled();
    try {
      const user = this.authService.user();
      if (!user?.business_id) throw new Error('No business found');

      // This would update a business-level setting
      // For now we just toggle the local state
      this.clientNotificationsEnabled.set(newValue);
      this.message.set({ type: 'success', text: newValue ? 'Client notifications enabled' : 'Client notifications disabled' });
    } catch (error: any) {
      this.message.set({ type: 'error', text: error.message || 'Failed to update' });
    }
    this.isSaving.set(false);
  }
}
