import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { RealtimeChannel } from '@supabase/supabase-js';

export type NotificationType =
  | 'appointment_scheduled'
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  | 'appointment_updated'
  | 'appointment_reminder'
  | 'reschedule_requested'
  | 'reschedule_approved'
  | 'reschedule_declined'
  | 'booking_requested'
  | 'booking_approved'
  | 'booking_declined'
  | 'new_message'
  | 'announcement';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  appointment_id?: string;
  sender_id?: string;
  read: boolean;
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService implements OnDestroy {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private router = inject(Router);

  private channel: RealtimeChannel | null = null;

  // Signals for reactive state
  private _notifications = signal<Notification[]>([]);
  private _isLoading = signal(false);

  // Public readonly signals
  readonly notifications = this._notifications.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  // Computed signals
  readonly unreadCount = computed(() => {
    return this._notifications().filter((n) => !n.read).length;
  });

  readonly hasUnread = computed(() => this.unreadCount() > 0);

  constructor() {
    // Subscribe when user changes
    this.auth.user;
  }

  ngOnDestroy() {
    this.unsubscribeFromRealtime();
  }

  async loadNotifications(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;

    this._isLoading.set(true);

    try {
      const { data, error } = await this.supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      this._notifications.set((data as Notification[]) || []);

      // Subscribe to realtime updates
      this.subscribeToRealtime(userId);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      this._isLoading.set(false);
    }
  }

  private subscribeToRealtime(userId: string) {
    // Unsubscribe from existing channel
    this.unsubscribeFromRealtime();

    // Subscribe to new notifications
    this.channel = this.supabase.client
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          this._notifications.update((notifications) => [newNotification, ...notifications]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          this._notifications.update((notifications) =>
            notifications.map((n) => (n.id === updated.id ? updated : n))
          );
        }
      )
      .subscribe();
  }

  private unsubscribeFromRealtime() {
    if (this.channel) {
      this.supabase.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  async markAsRead(notificationId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      // Update local state immediately
      this._notifications.update((notifications) =>
        notifications.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async markAllAsRead(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;

    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);

      if (error) throw error;

      // Update local state immediately
      this._notifications.update((notifications) => notifications.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }

  getNotificationRoute(notification: Notification): string {
    const isBarber = this.auth.isStaffOrOwner();
    const baseUrl = isBarber ? '/barber' : '/client';

    switch (notification.type) {
      case 'appointment_scheduled':
      case 'appointment_confirmed':
      case 'appointment_cancelled':
      case 'appointment_updated':
      case 'appointment_reminder':
      case 'reschedule_requested':
      case 'reschedule_approved':
      case 'reschedule_declined':
        return isBarber ? `${baseUrl}/calendar` : `${baseUrl}/dashboard`;

      case 'booking_requested':
      case 'booking_approved':
      case 'booking_declined':
        return isBarber ? `${baseUrl}/calendar` : `${baseUrl}/dashboard`;

      case 'new_message':
        return `${baseUrl}/messages`;

      case 'announcement':
        return `${baseUrl}/dashboard`;

      default:
        return `${baseUrl}/dashboard`;
    }
  }

  async handleNotificationClick(notification: Notification): Promise<void> {
    // Mark as read
    if (!notification.read) {
      await this.markAsRead(notification.id);
    }

    // Navigate to appropriate page
    const route = this.getNotificationRoute(notification);
    this.router.navigateByUrl(route);
  }

  getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case 'appointment_scheduled':
      case 'appointment_confirmed':
        return 'calendar-check';
      case 'appointment_cancelled':
        return 'calendar-x';
      case 'appointment_updated':
        return 'calendar-edit';
      case 'appointment_reminder':
        return 'bell';
      case 'reschedule_requested':
      case 'reschedule_approved':
      case 'reschedule_declined':
        return 'calendar-clock';
      case 'booking_requested':
      case 'booking_approved':
      case 'booking_declined':
        return 'calendar-plus';
      case 'new_message':
        return 'message';
      case 'announcement':
        return 'megaphone';
      default:
        return 'bell';
    }
  }

  getNotificationColor(type: NotificationType): 'success' | 'warning' | 'danger' | 'primary' | 'neutral' {
    switch (type) {
      case 'appointment_confirmed':
      case 'reschedule_approved':
      case 'booking_approved':
        return 'success';
      case 'appointment_cancelled':
      case 'reschedule_declined':
      case 'booking_declined':
        return 'danger';
      case 'reschedule_requested':
      case 'booking_requested':
      case 'appointment_reminder':
        return 'warning';
      case 'appointment_scheduled':
      case 'appointment_updated':
        return 'primary';
      default:
        return 'neutral';
    }
  }

  formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  clearNotifications() {
    this._notifications.set([]);
    this.unsubscribeFromRealtime();
  }
}
