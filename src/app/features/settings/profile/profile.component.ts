import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  profileForm: FormGroup;
  passwordForm: FormGroup;
  loading = signal(true);
  saving = signal(false);
  savingPassword = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  passwordError = signal<string | null>(null);
  passwordSuccess = signal<string | null>(null);
  activeTab = signal<'profile' | 'password'>('profile');

  // Check if user can change password (not OAuth users)
  get canChangePassword(): boolean {
    return !this.authService.isOAuthUser;
  }

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.profileForm = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      email: [{ value: '', disabled: true }],
      phone: ['']
    });

    this.passwordForm = this.fb.group({
      current_password: ['', Validators.required],
      new_password: ['', [Validators.required, Validators.minLength(8)]],
      confirm_password: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.loadProfile();
  }

  async loadProfile() {
    this.loading.set(true);
    try {
      const user = this.authService.currentUser();
      if (user) {
        this.profileForm.patchValue({
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email || '',
          phone: user.phone || ''
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      this.error.set('Failed to load profile');
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: 'profile' | 'password') {
    this.activeTab.set(tab);
    this.error.set(null);
    this.success.set(null);
    this.passwordError.set(null);
    this.passwordSuccess.set(null);
  }

  async saveProfile() {
    if (this.profileForm.invalid) return;

    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const formData = this.profileForm.getRawValue();
      await this.authService.updateProfile({
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone
      });
      this.success.set('Profile updated successfully');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      this.error.set(error.message || 'Failed to save profile');
    } finally {
      this.saving.set(false);
    }
  }

  async changePassword() {
    if (this.passwordForm.invalid) return;

    const { current_password, new_password, confirm_password } = this.passwordForm.value;

    if (new_password !== confirm_password) {
      this.passwordError.set('Passwords do not match');
      return;
    }

    this.savingPassword.set(true);
    this.passwordError.set(null);
    this.passwordSuccess.set(null);

    try {
      await this.authService.updatePassword(new_password);
      this.passwordSuccess.set('Password updated successfully');
      this.passwordForm.reset();
    } catch (error: any) {
      console.error('Error changing password:', error);
      this.passwordError.set(error.message || 'Failed to change password');
    } finally {
      this.savingPassword.set(false);
    }
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }

  getRoleLabel(): string {
    const user = this.authService.currentUser();
    switch (user?.role) {
      case 'owner': return 'Owner/Admin';
      case 'staff': return 'Staff Member';
      case 'client': return 'Client';
      default: return 'User';
    }
  }
}
