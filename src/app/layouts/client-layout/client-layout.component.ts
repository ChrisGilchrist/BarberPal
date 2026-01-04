import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-client-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './client-layout.component.html',
  styleUrl: './client-layout.component.scss'
})
export class ClientLayoutComponent {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  profile$ = this.supabase.profile$;
  mobileMenuOpen = signal(false);

  // Simplified nav for clients - just dashboard and settings
  navItems = [
    { path: '/client/dashboard', label: 'My Appointments', icon: 'calendar' },
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
}
