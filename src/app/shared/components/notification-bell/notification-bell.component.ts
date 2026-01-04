import { Component, inject, signal, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, Notification } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  private notificationService = inject(NotificationService);
  private elementRef = inject(ElementRef);

  isOpen = signal(false);

  // Expose service signals
  notifications = this.notificationService.notifications;
  unreadCount = this.notificationService.unreadCount;
  hasUnread = this.notificationService.hasUnread;
  isLoading = this.notificationService.isLoading;

  ngOnInit() {
    this.notificationService.loadNotifications();
  }

  ngOnDestroy() {
    this.notificationService.clearNotifications();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  toggleDropdown() {
    this.isOpen.update((v) => !v);
  }

  closeDropdown() {
    this.isOpen.set(false);
  }

  onNotificationClick(notification: Notification) {
    this.closeDropdown();
    this.notificationService.handleNotificationClick(notification);
  }

  markAllAsRead() {
    this.notificationService.markAllAsRead();
  }

  getNotificationColor(notification: Notification): string {
    return this.notificationService.getNotificationColor(notification.type);
  }

  formatTime(dateString: string): string {
    return this.notificationService.formatRelativeTime(dateString);
  }

  get displayCount(): string {
    const count = this.unreadCount();
    return count > 9 ? '9+' : count.toString();
  }
}
