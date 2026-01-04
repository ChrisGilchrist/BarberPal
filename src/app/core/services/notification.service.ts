import { Injectable, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private isSubscribed = signal(false);
  private permissionState = signal<NotificationPermission>('default');

  readonly subscribed = this.isSubscribed.asReadonly();
  readonly permission = this.permissionState.asReadonly();

  // VAPID public key - replace with your own from Supabase or a push service
  private readonly VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY';

  constructor(
    private swPush: SwPush,
    private supabase: SupabaseService
  ) {
    this.checkPermission();
    this.checkSubscription();
  }

  private checkPermission() {
    if ('Notification' in window) {
      this.permissionState.set(Notification.permission);
    }
  }

  private async checkSubscription() {
    if (this.swPush.isEnabled) {
      try {
        const subscription = await this.swPush.subscription.toPromise();
        this.isSubscribed.set(!!subscription);
      } catch {
        this.isSubscribed.set(false);
      }
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    const permission = await Notification.requestPermission();
    this.permissionState.set(permission);
    return permission === 'granted';
  }

  async subscribe(userId: string): Promise<boolean> {
    if (!this.swPush.isEnabled) {
      console.warn('Service Worker not enabled');
      return false;
    }

    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: this.VAPID_PUBLIC_KEY
      });

      // Save subscription to database
      const subJson = subscription.toJSON();
      const keys = subJson.keys as Record<string, string> | undefined;
      const { error } = await this.supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          endpoint: subJson.endpoint,
          p256dh: keys?.['p256dh'],
          auth: keys?.['auth']
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      this.isSubscribed.set(true);
      return true;
    } catch (error) {
      console.error('Failed to subscribe:', error);
      return false;
    }
  }

  async unsubscribe(userId: string): Promise<boolean> {
    try {
      // Remove from database
      await this.supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId);

      // Unsubscribe from browser
      const subscription = await this.swPush.subscription.toPromise();
      if (subscription) {
        await subscription.unsubscribe();
      }

      this.isSubscribed.set(false);
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      return false;
    }
  }

  // Listen for incoming messages
  listenForMessages() {
    this.swPush.messages.subscribe(message => {
      console.log('Push message received:', message);
    });

    this.swPush.notificationClicks.subscribe(click => {
      console.log('Notification clicked:', click);
      // Handle notification click - navigate to relevant page
      if (click.notification.data?.url) {
        window.open(click.notification.data.url, '_self');
      }
    });
  }

  // Show local notification (for in-app notifications)
  showLocalNotification(title: string, options?: NotificationOptions) {
    if (this.permissionState() === 'granted') {
      new Notification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        ...options
      });
    }
  }
}
