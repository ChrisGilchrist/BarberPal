import { Component, inject, signal, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PushNotificationService } from '../../../core/services/push-notification.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-push-prompt',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './push-prompt.component.html',
  styleUrl: './push-prompt.component.scss',
})
export class PushPromptComponent implements OnDestroy {
  private pushService = inject(PushNotificationService);
  private authService = inject(AuthService);

  isVisible = signal(false);
  isEnabling = signal(false);

  private readonly DISMISSED_KEY = 'barberpal_push_prompt_dismissed';
  private showTimeout: ReturnType<typeof setTimeout> | null = null;
  private hasChecked = false;

  constructor() {
    // Wait for push service to initialize before checking
    effect(() => {
      if (this.pushService.isInitialized() && !this.hasChecked) {
        this.hasChecked = true;
        this.checkShouldShow();
      }
    });
  }

  ngOnDestroy() {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
    }
  }

  private checkShouldShow() {
    // Don't show if already dismissed
    if (localStorage.getItem(this.DISMISSED_KEY)) {
      return;
    }

    // Don't show if not supported
    if (!this.pushService.isSupported()) {
      return;
    }

    // Don't show if already subscribed
    if (this.pushService.isSubscribed()) {
      return;
    }

    // Don't show if permission already granted (user already enabled notifications)
    if (this.pushService.permissionState() === 'granted') {
      return;
    }

    // Don't show if permission already denied
    if (this.pushService.permissionState() === 'denied') {
      return;
    }

    // Don't show if not logged in
    if (!this.authService.user()) {
      return;
    }

    // Check if running as PWA (installed)
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;

    // Show after a delay (give user time to settle in)
    this.showTimeout = setTimeout(
      () => {
        // Double-check subscription status before showing
        if (!this.pushService.isSubscribed()) {
          this.isVisible.set(true);
        }
      },
      isPWA ? 1500 : 5000
    ); // Show faster if PWA, slower if in browser
  }

  async enableNotifications() {
    this.isEnabling.set(true);

    try {
      const success = await this.pushService.subscribe();

      if (success) {
        // Mark as dismissed so it doesn't show again
        localStorage.setItem(this.DISMISSED_KEY, 'true');
        this.dismiss();
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
    } finally {
      this.isEnabling.set(false);
    }
  }

  dismiss() {
    this.isVisible.set(false);
  }

  notNow() {
    localStorage.setItem(this.DISMISSED_KEY, 'true');
    this.dismiss();
  }
}
