import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {
  email = '';
  isLoading = signal(false);
  error = signal<string | null>(null);
  success = signal(false);

  constructor(private authService: AuthService) {}

  async onSubmit() {
    if (!this.email) {
      this.error.set('Please enter your email');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const result = await this.authService.resetPassword(this.email);

    this.isLoading.set(false);

    if (result.success) {
      this.success.set(true);
    } else {
      this.error.set(result.error || 'Failed to send reset email');
    }
  }
}
