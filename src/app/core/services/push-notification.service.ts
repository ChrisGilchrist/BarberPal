import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

@Injectable({
  providedIn: 'root',
})
export class PushNotificationService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private router = inject(Router);

  // Signals for reactive state
  private _permissionState = signal<PermissionState>('default');
  private _isSubscribed = signal(false);
  private _isLoading = signal(false);
  private _isInitialized = signal(false);

  // Public readonly signals
  readonly permissionState = this._permissionState.asReadonly();
  readonly isSubscribed = this._isSubscribed.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isInitialized = this._isInitialized.asReadonly();

  // Computed signals
  readonly isSupported = computed(() => {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  });

  readonly canSubscribe = computed(() => {
    return this.isSupported() && this._permissionState() !== 'denied';
  });

  constructor() {
    this.init();
  }

  private async init() {
    // Check browser support
    if (!this.isSupported()) {
      this._permissionState.set('unsupported');
      this._isInitialized.set(true);
      return;
    }

    // Check current permission
    this._permissionState.set(Notification.permission as PermissionState);

    // Check subscription status
    await this.checkSubscriptionStatus();

    // Listen for service worker messages
    this.listenForMessages();

    // Mark as initialized
    this._isInitialized.set(true);
  }

  async checkSubscriptionStatus(): Promise<boolean> {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      this._isSubscribed.set(!!subscription);
      return !!subscription;
    } catch (error) {
      console.error('Error checking subscription status:', error);
      this._isSubscribed.set(false);
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn('Push notifications not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this._permissionState.set(permission as PermissionState);
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting permission:', error);
      return false;
    }
  }

  async subscribe(): Promise<boolean> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      console.error('User not authenticated');
      return false;
    }

    if (!this.isSupported()) {
      console.error('Push notifications not supported');
      return false;
    }

    this._isLoading.set(true);

    try {
      // Request permission if not granted
      if (this._permissionState() !== 'granted') {
        const granted = await this.requestPermission();
        if (!granted) {
          this._isLoading.set(false);
          return false;
        }
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Convert VAPID key to Uint8Array
      const vapidKey = this.urlBase64ToUint8Array(environment.vapidPublicKey);

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey as BufferSource,
      });

      // Save to database
      const saved = await this.saveSubscription(userId, subscription);
      if (!saved) {
        await subscription.unsubscribe();
        this._isLoading.set(false);
        return false;
      }

      // Update user's push_notifications_enabled flag
      await this.supabase
        .from('users')
        .update({ push_notifications_enabled: true })
        .eq('id', userId);

      this._isSubscribed.set(true);
      this._isLoading.set(false);
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      this._isLoading.set(false);
      return false;
    }
  }

  async unsubscribe(): Promise<boolean> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      return false;
    }

    this._isLoading.set(true);

    try {
      // Get current subscription
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from database
        await this.supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);

        // Unsubscribe from push
        await subscription.unsubscribe();
      }

      // Update user's push_notifications_enabled flag
      await this.supabase
        .from('users')
        .update({ push_notifications_enabled: false })
        .eq('id', userId);

      this._isSubscribed.set(false);
      this._isLoading.set(false);
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      this._isLoading.set(false);
      return false;
    }
  }

  private async saveSubscription(userId: string, subscription: PushSubscription): Promise<boolean> {
    try {
      const subJson = subscription.toJSON();
      const keys = subJson.keys as Record<string, string> | undefined;

      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
      };

      const { error } = await this.supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: subJson.endpoint,
          p256dh: keys?.['p256dh'],
          auth: keys?.['auth'],
          device_info: deviceInfo,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'endpoint',
        }
      );

      if (error) {
        console.error('Error saving subscription:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving subscription:', error);
      return false;
    }
  }

  private listenForMessages() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        const url = event.data.url;
        if (url) {
          this.router.navigateByUrl(url);
        }
      }
    });
  }

  async sendTestNotification(): Promise<void> {
    if (this._permissionState() !== 'granted') {
      console.warn('Notification permission not granted');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Test Notification', {
      body: 'Push notifications are working!',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'test',
      data: {
        url: '/client/dashboard',
        type: 'test',
      },
    });
  }

  /**
   * Re-subscribe to push notifications with fresh encryption keys.
   * Call this after VAPID keys have been changed on the server.
   */
  async resubscribe(): Promise<boolean> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      console.error('User not authenticated');
      return false;
    }

    this._isLoading.set(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();

      // Unsubscribe from existing push subscription (this clears browser-side keys)
      if (existingSubscription) {
        await existingSubscription.unsubscribe();
      }

      // Delete all subscriptions for this user from database
      await this.supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId);

      // Now subscribe fresh with current VAPID key
      const vapidKey = this.urlBase64ToUint8Array(environment.vapidPublicKey);
      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey as BufferSource,
      });

      // Save new subscription to database
      const saved = await this.saveSubscription(userId, newSubscription);
      if (!saved) {
        await newSubscription.unsubscribe();
        this._isLoading.set(false);
        return false;
      }

      // Update user's push_notifications_enabled flag
      await this.supabase
        .from('users')
        .update({ push_notifications_enabled: true })
        .eq('id', userId);

      this._isSubscribed.set(true);
      this._isLoading.set(false);
      console.log('Successfully re-subscribed to push notifications');
      return true;
    } catch (error) {
      console.error('Error re-subscribing to push:', error);
      this._isLoading.set(false);
      return false;
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}
