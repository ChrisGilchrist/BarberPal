import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { NotificationBellComponent } from '../../shared/components/notification-bell/notification-bell.component';
import { PushPromptComponent } from '../../shared/components/push-prompt/push-prompt.component';

@Component({
  selector: 'app-barber-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationBellComponent, PushPromptComponent],
  templateUrl: './barber-layout.component.html',
  styleUrl: './barber-layout.component.scss'
})
export class BarberLayoutComponent {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  profile$ = this.supabase.profile$;
  mobileMenuOpen = signal(false);

  navItems = [
    { path: '/barber/dashboard', label: 'Dashboard', icon: 'home' },
    { path: '/barber/calendar', label: 'Calendar', icon: 'calendar' },
    { path: '/barber/clients', label: 'Clients', icon: 'users' },
    { path: '/barber/services', label: 'Services', icon: 'scissors' },
  ];

  bottomNavItems = [
    { path: '/barber/settings', label: 'Settings', icon: 'settings' }
  ];

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/auth/login']);
  }

  getInitials(firstName?: string, lastName?: string): string {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  }

  formatRole(role?: string): string {
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  }
}
