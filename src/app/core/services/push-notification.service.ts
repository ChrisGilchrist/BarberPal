import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { environment } from '../../../environments/environment';

export type PushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  private supabase = inject(SupabaseService);

  // Signals for reactive state
  permissionState = signal<PushPermissionState>('default');
  isSubscribed = signal(false);
  isSupported = signal(false);
  isLoading = signal(false);

  // Computed properties
  canRequestPermission = computed(() =>
    this.isSupported() && this.permissionState() === 'default'
  );

  canSubscribe = computed(() =>
    this.isSupported() && this.permissionState() === 'granted' && !this.isSubscribed()
  );

  constructor() {
    this.checkSupport();
    this.checkPermissionState();
  }

  /**
   * Check if the browser supports push notifications
   */
  private checkSupport(): void {
    const supported = 'serviceWorker' in navigator &&
                      'PushManager' in window &&
                      'Notification' in window;
    this.isSupported.set(supported);
  }

  /**
   * Check current notification permission state
   */
  private checkPermissionState(): void {
    if (!this.isSupported()) {
      this.permissionState.set('unsupported');
      return;
    }
    this.permissionState.set(Notification.permission as PushPermissionState);
  }

  /**
   * Request notification permission from the user
   */
  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;

    const result = await Notification.requestPermission();
    this.permissionState.set(result as PushPermissionState);
    return result === 'granted';
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(): Promise<boolean> {
    if (!this.isSupported() || this.permissionState() !== 'granted') {
      return false;
    }

    this.isLoading.set(true);

    try {
      const registration = await navigator.serviceWorker.ready;

      // Get existing subscription or create new one
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const applicationServerKey = this.urlBase64ToUint8Array(environment.vapidPublicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey.buffer as ArrayBuffer
        });
      }

      // Save subscription to database
      await this.saveSubscription(subscription);
      this.isSubscribed.set(true);

      // Update profile flag
      await this.updatePushEnabled(true);

      return true;
    } catch (error) {
      console.error('Failed to subscribe to push:', error);
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<boolean> {
    this.isLoading.set(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await this.removeSubscription(subscription.endpoint);
      }

      this.isSubscribed.set(false);
      await this.updatePushEnabled(false);

      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from push:', error);
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Check if user is currently subscribed to push notifications
   */
  async checkSubscriptionStatus(): Promise<void> {
    if (!this.isSupported()) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      this.isSubscribed.set(!!subscription);
    } catch {
      this.isSubscribed.set(false);
    }
  }

  /**
   * Save push subscription to database
   */
  private async saveSubscription(subscription: PushSubscription): Promise<void> {
    const userId = this.supabase.currentUser?.id;
    if (!userId) throw new Error('No user logged in');

    const json = subscription.toJSON();
    const keys = json.keys as Record<string, string> | undefined;

    const { error } = await this.supabase.client
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: keys?.['p256dh'],
        auth: keys?.['auth'],
        device_info: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language
        }
      }, { onConflict: 'endpoint' });

    if (error) throw error;
  }

  /**
   * Remove push subscription from database
   */
  private async removeSubscription(endpoint: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) throw error;
  }

  /**
   * Update push_notifications_enabled flag on user profile
   */
  private async updatePushEnabled(enabled: boolean): Promise<void> {
    const userId = this.supabase.currentUser?.id;
    if (!userId) return;

    await this.supabase.client
      .from('users')
      .update({ push_notifications_enabled: enabled })
      .eq('id', userId);
  }

  /**
   * Send a test push notification (for testing purposes)
   * This shows a notification directly without going through the server
   */
  async sendTestNotification(): Promise<boolean> {
    if (!this.isSupported() || !this.isSubscribed()) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('BarberPal Test', {
        body: 'Push notifications are working!',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'test-notification',
        data: {
          url: '/client/dashboard',
          type: 'test'
        }
      });
      return true;
    } catch (error) {
      console.error('Failed to send test notification:', error);
      return false;
    }
  }

  /**
   * Convert VAPID key from base64 URL format to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}
