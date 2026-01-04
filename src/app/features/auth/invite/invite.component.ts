import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

/**
 * Invite Component
 *
 * Handles invite links: /invite/{barber_id}
 *
 * Flow:
 * 1. Extract barber_id from URL
 * 2. Fetch barber's name for display
 * 3. Store barber info in localStorage
 * 4. If user is logged in -> redirect to auth-callback
 * 5. If not logged in -> show invite page with login/register options
 */
@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loading()) {
      <div class="invite-page">
        <div class="invite-card">
          <div class="spinner-large"></div>
          <p>Loading invite...</p>
        </div>
      </div>
    } @else if (error()) {
      <div class="invite-page">
        <div class="invite-card">
          <div class="error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <h2>Invalid Invite</h2>
          <p>{{ error() }}</p>
          <a href="/auth/login" class="btn btn--primary">Go to Login</a>
        </div>
      </div>
    } @else {
      <div class="invite-page">
        <div class="invite-card">
          <div class="logo">
            <span class="logo-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="6" cy="6" r="3"/>
                <circle cx="6" cy="18" r="3"/>
                <line x1="20" y1="4" x2="8.12" y2="15.88"/>
                <line x1="14.47" y1="14.48" x2="20" y2="20"/>
                <line x1="8.12" y1="8.12" x2="12" y2="12"/>
              </svg>
            </span>
            <span class="logo-text">BarberPal</span>
          </div>

          <div class="barber-info">
            @if (barberAvatar()) {
              <img [src]="barberAvatar()" [alt]="barberName()" class="barber-avatar" referrerpolicy="no-referrer">
            } @else {
              <div class="barber-avatar barber-avatar--placeholder">
                {{ getInitials(barberName()) }}
              </div>
            }
            <h1>{{ barberName() }}</h1>
            <p>has invited you to book appointments</p>
          </div>

          <div class="actions">
            <a href="/auth/register" class="btn btn--primary btn--lg">Create Account</a>
            <a href="/auth/login" class="btn btn--secondary btn--lg">Sign In</a>
          </div>

          <p class="footer-text">
            Already have an account? <a href="/auth/login">Sign in</a> to continue.
          </p>
        </div>
      </div>
    }
  `,
  styleUrl: './invite.component.scss'
})
export class InviteComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SupabaseService);

  loading = signal(true);
  error = signal<string | null>(null);
  barberName = signal<string>('');
  barberAvatar = signal<string | null>(null);

  async ngOnInit() {
    const barberId = this.route.snapshot.paramMap.get('barberId');

    if (!barberId) {
      this.error.set('No barber ID provided');
      this.loading.set(false);
      return;
    }

    try {
      // Fetch barber info - use maybeSingle() to handle 0 rows gracefully
      const { data: barber, error: barberError } = await this.supabase.client
        .from('users')
        .select('id, first_name, last_name, avatar_url, business_id')
        .eq('id', barberId)
        .in('role', ['owner', 'staff'])
        .maybeSingle();

      if (barberError) {
        console.error('Error fetching barber:', barberError);
        this.error.set('This invite link is invalid or expired');
        this.loading.set(false);
        return;
      }

      if (!barber) {
        this.error.set('This invite link is invalid or expired');
        this.loading.set(false);
        return;
      }

      // Store barber info for after auth
      localStorage.setItem('pendingBarberId', barber.id);
      localStorage.setItem('pendingBarberName', `${barber.first_name} ${barber.last_name}`);

      this.barberName.set(`${barber.first_name} ${barber.last_name}`);
      this.barberAvatar.set(barber.avatar_url);

      // Check if user is already logged in
      const session = await this.supabase.client.auth.getSession();
      if (session.data.session) {
        // User is logged in - redirect to auth-callback to complete linking
        this.router.navigate(['/auth/callback']);
        return;
      }

      this.loading.set(false);
    } catch (err: any) {
      console.error('Error loading invite:', err);
      this.error.set('Failed to load invite information');
      this.loading.set(false);
    }
  }

  getInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.split(' ');
    return parts.map(p => p.charAt(0)).join('').toUpperCase().slice(0, 2);
  }
}
