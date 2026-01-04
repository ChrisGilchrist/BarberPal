import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  firstName = '';
  lastName = '';
  email = '';
  password = '';
  confirmPassword = '';
  isLoading = signal(false);
  error = signal<string | null>(null);
  success = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async onSubmit() {
    // Validation
    if (!this.firstName || !this.lastName || !this.email || !this.password) {
      this.error.set('Please fill in all fields');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }

    if (this.password.length < 6) {
      this.error.set('Password must be at least 6 characters');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const result = await this.authService.signUp(
      this.email,
      this.password,
      this.firstName,
      this.lastName,
      'client' // Default role for new registrations
    );

    this.isLoading.set(false);

    if (result.success) {
      this.success.set(true);
    } else {
      this.error.set(result.error || 'Registration failed');
    }
  }
}
