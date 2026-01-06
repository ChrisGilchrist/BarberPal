import { Component, OnInit, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { DayOfWeek, RecurringTimeBlock } from '../../core/models';

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

  // Recurring Time blocks
  recurringBlocks = signal<RecurringTimeBlock[]>([]);
  showBlockModal = signal(false);
  blockDay = signal<number>(1); // 0=Sun, 1=Mon, etc.
  blockStartTime = signal('12:00');
  blockEndTime = signal('13:00');
  blockReason = signal('');
  savingBlock = signal(false);
  dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Time options for dropdown (7 AM to 10 PM in 15-min increments)
  timeOptions = Array.from({ length: 61 }, (_, i) => {
    const totalMinutes = (7 * 60) + (i * 15);
    const hour = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }).filter(t => {
    const [h] = t.split(':').map(Number);
    return h <= 22;
  });

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

      // Load time blocks
      await this.loadTimeBlocks();
    }

    this.isLoading.set(false);
  }

  async loadTimeBlocks() {
    const user = this.authService.user();
    if (!user) return;

    try {
      const { data } = await this.businessService.getRecurringTimeBlocks({ userId: user.id });
      if (data) {
        this.recurringBlocks.set(data);
      }
    } catch (error) {
      console.error('Error loading recurring time blocks:', error);
    }
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

  // Recurring Time Block Methods
  openBlockModal() {
    this.blockDay.set(1); // Default to Monday
    this.blockStartTime.set('12:00');
    this.blockEndTime.set('13:00');
    this.blockReason.set('');
    this.showBlockModal.set(true);
  }

  closeBlockModal() {
    this.showBlockModal.set(false);
  }

  async saveTimeBlock() {
    const user = this.authService.user();
    if (!user) return;

    this.savingBlock.set(true);
    try {
      await this.businessService.createRecurringTimeBlock({
        user_id: user.id,
        business_id: user.business_id || null,
        day_of_week: this.blockDay() as DayOfWeek,
        start_time: this.blockStartTime(),
        end_time: this.blockEndTime(),
        reason: this.blockReason() || null
      });

      await this.loadTimeBlocks();
      this.closeBlockModal();
      this.message.set({ type: 'success', text: 'Recurring time block added' });
    } catch (error: any) {
      this.message.set({ type: 'error', text: error.message || 'Failed to add time block' });
    } finally {
      this.savingBlock.set(false);
    }
  }

  async deleteTimeBlock(blockId: string) {
    try {
      await this.businessService.deleteRecurringTimeBlock(blockId);
      await this.loadTimeBlocks();
      this.message.set({ type: 'success', text: 'Recurring time block deleted' });
    } catch (error: any) {
      this.message.set({ type: 'error', text: error.message || 'Failed to delete time block' });
    }
  }

  formatTimeOption(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  formatBlockTime(time: string): string {
    return this.formatTimeOption(time);
  }
}
