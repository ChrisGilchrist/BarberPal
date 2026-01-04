import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase.service';

type UserRole = 'owner' | 'staff' | 'client';

interface BarberListing {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  business_id: string;
  business_name: string;
}

/**
 * Auth Callback Component
 *
 * Single entry point after login/signup. Handles:
 * 1. Waiting for Supabase to process tokens
 * 2. Checking if user has a role set
 * 3. Showing role selection if needed (new users)
 * 4. Redirecting to appropriate dashboard
 *
 * For clients:
 * - Fast track: Use invite link/QR from barber for direct signup
 * - Browse: Search and select from available barbers
 * For barbers: they select "I'm a Barber" and get owner role
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (state() === 'loading') {
      <div class="auth-callback">
        <div class="auth-callback__card">
          <div class="spinner-large"></div>
          <p>Setting up your account...</p>
        </div>
      </div>
    } @else if (state() === 'select-role') {
      <div class="auth-callback">
        <div class="auth-callback__card auth-callback__card--wide">
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

          <h1>Welcome to BarberPal</h1>

          @if (barberName()) {
            <p class="subtitle">You've been invited by <strong>{{ barberName() }}</strong></p>
          } @else {
            <p class="subtitle">How will you be using BarberPal?</p>
          }

          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }

          <div class="role-cards">
            @if (barberId()) {
              <!-- Invited user - only show client option -->
              <button
                class="role-card role-card--client"
                [disabled]="saving()"
                (click)="selectRole('client')"
              >
                <div class="role-card__icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <h3>Continue as Client</h3>
                <p>Book appointments with {{ barberName() }}</p>
                @if (saving()) {
                  <span class="role-card__spinner"></span>
                }
              </button>
            } @else {
              <button
                class="role-card role-card--barber"
                [disabled]="saving()"
                (click)="selectRole('owner')"
              >
                <div class="role-card__icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="6" cy="6" r="3"/>
                    <circle cx="6" cy="18" r="3"/>
                    <line x1="20" y1="4" x2="8.12" y2="15.88"/>
                    <line x1="14.47" y1="14.48" x2="20" y2="20"/>
                    <line x1="8.12" y1="8.12" x2="12" y2="12"/>
                  </svg>
                </div>
                <h3>I'm a Barber</h3>
                <p>Manage appointments and clients</p>
                @if (saving()) {
                  <span class="role-card__spinner"></span>
                }
              </button>

              <button
                class="role-card role-card--client"
                [disabled]="saving()"
                (click)="showBrowseBarbers()"
              >
                <div class="role-card__icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <h3>I'm a Client</h3>
                <p>Book appointments with your barber</p>
                @if (saving()) {
                  <span class="role-card__spinner"></span>
                }
              </button>
            }
          </div>
        </div>
      </div>
    } @else if (state() === 'browse-barbers') {
      <div class="auth-callback">
        <div class="auth-callback__card auth-callback__card--wide">
          <button class="back-btn" (click)="state.set('select-role')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>

          <h2>Find Your Barber</h2>
          <p class="subtitle">Search for your barber or browse available options</p>

          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }

          <div class="search-box">
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search by name or business..."
              [(ngModel)]="searchQuery"
              class="search-input"
            />
          </div>

          @if (loadingBarbers()) {
            <div class="barbers-loading">
              <div class="spinner"></div>
              <p>Loading barbers...</p>
            </div>
          } @else if (filteredBarbers().length === 0) {
            <div class="no-results">
              <p>No barbers found</p>
              @if (searchQuery()) {
                <button class="btn btn--link" (click)="searchQuery.set('')">Clear search</button>
              }
            </div>
          } @else {
            <div class="barbers-list">
              @for (barber of filteredBarbers(); track barber.id) {
                <button
                  class="barber-card"
                  [disabled]="saving()"
                  (click)="selectBarber(barber)"
                >
                  <div class="barber-avatar">
                    @if (barber.avatar_url) {
                      <img [src]="barber.avatar_url" [alt]="barber.first_name" referrerpolicy="no-referrer" />
                    } @else {
                      <span class="avatar-initials">
                        {{ barber.first_name[0] }}{{ barber.last_name?.[0] || '' }}
                      </span>
                    }
                  </div>
                  <div class="barber-info">
                    <h4>{{ barber.first_name }} {{ barber.last_name }}</h4>
                    <p>{{ barber.business_name }}</p>
                  </div>
                  @if (saving() && selectedBarber()?.id === barber.id) {
                    <span class="barber-card__spinner"></span>
                  }
                </button>
              }
            </div>
          }

          <p class="hint-text">
            Have an invite link? <a href="/auth/login">Sign in</a> using that link instead.
          </p>
        </div>
      </div>
    } @else if (state() === 'error') {
      <div class="auth-callback">
        <div class="auth-callback__card">
          <div class="error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <h2>Something went wrong</h2>
          <p>{{ error() }}</p>
          <button class="btn btn--primary" (click)="goToLogin()">Back to Login</button>
        </div>
      </div>
    }
  `,
  styleUrl: './auth-callback.component.scss'
})
export class AuthCallbackComponent implements OnInit, OnDestroy {
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private subscription?: Subscription;

  state = signal<'loading' | 'select-role' | 'browse-barbers' | 'error'>('loading');
  error = signal<string | null>(null);
  saving = signal(false);

  barberId = signal<string | null>(null);
  barberName = signal<string | null>(null);

  // Browse barbers state
  allBarbers = signal<BarberListing[]>([]);
  loadingBarbers = signal(false);
  searchQuery = signal('');
  selectedBarber = signal<BarberListing | null>(null);

  filteredBarbers = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const barbers = this.allBarbers();

    if (!query) return barbers;

    return barbers.filter(b =>
      b.first_name.toLowerCase().includes(query) ||
      b.last_name.toLowerCase().includes(query) ||
      b.business_name.toLowerCase().includes(query) ||
      `${b.first_name} ${b.last_name}`.toLowerCase().includes(query)
    );
  });

  async ngOnInit() {
    // Get pending data from localStorage (set by invite link)
    const pendingBarberId = localStorage.getItem('pendingBarberId');
    const pendingBarberName = localStorage.getItem('pendingBarberName');

    if (pendingBarberId) {
      this.barberId.set(pendingBarberId);
    }
    if (pendingBarberName) {
      this.barberName.set(pendingBarberName);
    }

    // Wait for Supabase to initialize
    this.subscription = this.supabase.initialized$.pipe(
      filter(init => init),
      take(1)
    ).subscribe(async () => {
      // Give Supabase a moment to process tokens
      await new Promise(resolve => setTimeout(resolve, 500));

      const session = await this.supabase.client.auth.getSession();

      if (!session.data.session) {
        // No session - redirect to login
        this.router.navigate(['/auth/login']);
        return;
      }

      // Wait for profile to load
      await this.waitForProfile();

      const profile = this.supabase.currentProfile;

      if (profile?.role && profile.role !== 'client') {
        // User already has a role - redirect to dashboard
        this.clearPendingData();
        this.redirectToDashboard(profile.role as UserRole);
        return;
      }

      // Check if client has a business_id (linked to a barber)
      if (profile?.role === 'client' && profile.business_id) {
        this.clearPendingData();
        this.redirectToDashboard('client');
        return;
      }

      // New user needs role assignment
      if (pendingBarberId) {
        // User came from invite link - auto-assign as client
        await this.autoAssignClientRole(pendingBarberId);
        return;
      }

      // No invite - show role selection
      this.state.set('select-role');
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  private async waitForProfile(): Promise<void> {
    return new Promise((resolve) => {
      if (this.supabase.currentProfile !== null) {
        resolve();
        return;
      }

      const sub = this.supabase.profile$.subscribe((profile) => {
        if (profile !== null) {
          sub.unsubscribe();
          resolve();
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        sub.unsubscribe();
        resolve();
      }, 5000);
    });
  }

  private async autoAssignClientRole(barberId: string) {
    const user = this.supabase.currentUser;
    if (!user) {
      this.error.set('No user session found');
      this.state.set('error');
      return;
    }

    try {
      // Get the barber's business_id
      const { data: barberProfile, error: barberError } = await this.supabase.client
        .from('users')
        .select('business_id')
        .eq('id', barberId)
        .single();

      if (barberError || !barberProfile?.business_id) {
        throw new Error('Could not find barber information');
      }

      const updates: Record<string, unknown> = {
        role: 'client',
        business_id: barberProfile.business_id,
        favorite_staff_id: barberId // Link client to this specific barber
      };

      // Sync Google profile data if available
      const metadata = user.user_metadata;
      if (metadata) {
        if (metadata['avatar_url'] || metadata['picture']) {
          updates['avatar_url'] = metadata['avatar_url'] || metadata['picture'];
        }
        const fullName = metadata['full_name'] || metadata['name'];
        if (fullName) {
          const nameParts = fullName.split(' ');
          updates['first_name'] = nameParts[0] || '';
          updates['last_name'] = nameParts.slice(1).join(' ') || '';
        }
      }

      const { error } = await this.supabase.client
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      // Reload profile
      await this.supabase.loadProfile(user.id);

      this.clearPendingData();
      this.redirectToDashboard('client');
    } catch (err: any) {
      console.error('Error auto-assigning client role:', err);
      this.error.set(err.message || 'Failed to set up your account');
      this.state.set('error');
    }
  }

  async selectRole(role: UserRole) {
    this.saving.set(true);
    this.error.set(null);

    const user = this.supabase.currentUser;
    if (!user) {
      this.error.set('No user session found');
      this.saving.set(false);
      return;
    }

    try {
      if (role === 'owner') {
        // Create a new business for the barber using RPC function (bypasses RLS)
        const businessName = `${user.user_metadata?.['first_name'] || 'My'}'s Barbershop`;
        const { data: businessId, error: businessError } = await this.supabase.client
          .rpc('create_business_and_link_user', { business_name: businessName });

        if (businessError) throw businessError;

        // Create default working hours for the barber
        const defaultWorkingHours = [
          { user_id: user.id, day_of_week: 0, start_time: '09:00', end_time: '17:00', is_active: false }, // Sunday - closed
          { user_id: user.id, day_of_week: 1, start_time: '09:00', end_time: '18:00', is_active: true },  // Monday
          { user_id: user.id, day_of_week: 2, start_time: '09:00', end_time: '18:00', is_active: true },  // Tuesday
          { user_id: user.id, day_of_week: 3, start_time: '09:00', end_time: '18:00', is_active: true },  // Wednesday
          { user_id: user.id, day_of_week: 4, start_time: '09:00', end_time: '18:00', is_active: true },  // Thursday
          { user_id: user.id, day_of_week: 5, start_time: '09:00', end_time: '18:00', is_active: true },  // Friday
          { user_id: user.id, day_of_week: 6, start_time: '10:00', end_time: '16:00', is_active: true },  // Saturday
        ];

        await this.supabase.client
          .from('working_hours')
          .insert(defaultWorkingHours);

        // Sync Google profile data if available
        const metadata = user.user_metadata;
        if (metadata) {
          const updates: Record<string, unknown> = {};
          if (metadata['avatar_url'] || metadata['picture']) {
            updates['avatar_url'] = metadata['avatar_url'] || metadata['picture'];
          }
          if (Object.keys(updates).length > 0) {
            await this.supabase.client
              .from('users')
              .update(updates)
              .eq('id', user.id);
          }
        }

        // Reload profile
        await this.supabase.loadProfile(user.id);

        this.clearPendingData();
        this.redirectToDashboard('owner');
      } else if (role === 'client' && this.barberId()) {
        // Client with invite - handled by autoAssignClientRole
        await this.autoAssignClientRole(this.barberId()!);
      }
    } catch (err: any) {
      console.error('Error setting role:', err);
      this.error.set(err.message || 'Failed to set account type');
      this.saving.set(false);
    }
  }

  async showBrowseBarbers() {
    this.state.set('browse-barbers');
    this.loadingBarbers.set(true);
    this.error.set(null);

    try {
      // Fetch all barbers (owners and staff) with their business info
      const { data, error } = await this.supabase.client
        .from('users')
        .select(`
          id,
          first_name,
          last_name,
          avatar_url,
          business_id,
          businesses:business_id (name)
        `)
        .in('role', ['owner', 'staff'])
        .not('business_id', 'is', null);

      if (error) throw error;

      const barbers: BarberListing[] = (data || []).map((b: any) => ({
        id: b.id,
        first_name: b.first_name || '',
        last_name: b.last_name || '',
        avatar_url: b.avatar_url,
        business_id: b.business_id,
        business_name: b.businesses?.name || 'Barbershop'
      }));

      this.allBarbers.set(barbers);
    } catch (err: any) {
      console.error('Error loading barbers:', err);
      this.error.set('Failed to load barbers. Please try again.');
    } finally {
      this.loadingBarbers.set(false);
    }
  }

  async selectBarber(barber: BarberListing) {
    this.selectedBarber.set(barber);
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.autoAssignClientRole(barber.id);
    } catch (err: any) {
      console.error('Error selecting barber:', err);
      this.error.set(err.message || 'Failed to link to barber');
      this.saving.set(false);
    }
  }

  private redirectToDashboard(role: UserRole) {
    if (role === 'owner' || role === 'staff') {
      this.router.navigate(['/barber/dashboard']);
    } else {
      this.router.navigate(['/client/dashboard']);
    }
  }

  private clearPendingData() {
    localStorage.removeItem('pendingBarberId');
    localStorage.removeItem('pendingBarberName');
  }

  goToLogin() {
    this.clearPendingData();
    this.router.navigate(['/auth/login']);
  }
}
