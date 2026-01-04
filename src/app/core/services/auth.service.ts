import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { UserProfile, UserRole } from '../models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Reactive state using signals
  private _isLoading = signal(true);
  private _profile = signal<UserProfile | null>(null);

  // Public signals
  readonly user = computed(() => this._profile());
  readonly currentUser = this.user; // Alias
  readonly isAuthenticated = computed(() => !!this._profile());
  readonly isLoading = computed(() => this._isLoading());
  readonly userRole = computed(() => this._profile()?.role ?? null);

  // Role checks
  readonly isOwner = computed(() => this.userRole() === 'owner');
  readonly isStaff = computed(() => this.userRole() === 'staff');
  readonly isClient = computed(() => this.userRole() === 'client');
  readonly isStaffOrOwner = computed(() => this.isOwner() || this.isStaff());

  // Auth provider check
  get isOAuthUser(): boolean {
    return this.supabase.isOAuthUser;
  }

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {
    this.initializeAuth();
  }

  private initializeAuth() {
    // Subscribe to profile changes from SupabaseService
    this.supabase.profile$.subscribe(profile => {
      this._profile.set(profile);
    });

    // Subscribe to initialized state
    this.supabase.initialized$.subscribe(initialized => {
      if (initialized) {
        this._isLoading.set(false);
      }
    });
  }

  // Wait for auth to be initialized
  async waitForInit(): Promise<void> {
    if (this.supabase.isInitialized) return;

    return new Promise(resolve => {
      this.supabase.initialized$
        .pipe(filter(init => init), take(1))
        .subscribe(() => resolve());
    });
  }

  async signUp(email: string, password: string, firstName: string, lastName: string, role: UserRole = 'client') {
    try {
      await this.supabase.signUp(email, password, role, firstName, lastName);
      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async signIn(email: string, password: string) {
    try {
      await this.supabase.signIn(email, password);

      // Wait for profile to load
      await this.waitForProfile();

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async waitForProfile(): Promise<void> {
    // Give it a moment for the profile to load after sign in
    return new Promise(resolve => {
      let attempts = 0;
      const maxAttempts = 20; // 2 seconds max
      const interval = setInterval(() => {
        attempts++;
        if (this.supabase.currentProfile || attempts >= maxAttempts) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  async signOut() {
    await this.supabase.signOut();
    this.router.navigate(['/auth/login']);
  }

  async resetPassword(email: string) {
    try {
      await this.supabase.resetPassword(email);
      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async updatePassword(newPassword: string) {
    try {
      await this.supabase.updatePassword(newPassword);
      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async updateProfile(updates: { first_name?: string; last_name?: string; phone?: string; avatar_url?: string }) {
    try {
      await this.supabase.updateProfile(updates);
      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
