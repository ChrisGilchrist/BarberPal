import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth to be initialized before checking
  await authService.waitForInit();

  if (authService.isAuthenticated()) {
    return true;
  }

  router.navigate(['/auth/login']);
  return false;
};

export const guestGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth to be initialized before checking
  await authService.waitForInit();

  if (!authService.isAuthenticated()) {
    return true;
  }

  // Redirect based on role
  const role = authService.userRole();
  if (role === 'client') {
    router.navigate(['/client/dashboard']);
  } else {
    router.navigate(['/dashboard']);
  }
  return false;
};

export const ownerGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth to be initialized before checking
  await authService.waitForInit();

  if (authService.isOwner()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};

export const staffOrOwnerGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth to be initialized before checking
  await authService.waitForInit();

  if (authService.isStaffOrOwner()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};

export const clientGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth to be initialized before checking
  await authService.waitForInit();

  if (authService.isClient()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
