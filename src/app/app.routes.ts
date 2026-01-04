import { Routes } from '@angular/router';
import { authGuard, guestGuard, ownerGuard, staffOrOwnerGuard, clientGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Default redirect - will be handled by auth-callback after login
  {
    path: '',
    redirectTo: 'auth/callback',
    pathMatch: 'full'
  },

  // Invite link (public)
  {
    path: 'invite/:barberId',
    loadComponent: () => import('./features/auth/invite/invite.component').then(m => m.InviteComponent)
  },

  // Auth routes
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
      },
      {
        path: 'register',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
      },
      {
        path: 'forgot-password',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
      },
      {
        path: 'callback',
        loadComponent: () => import('./features/auth/auth-callback/auth-callback.component').then(m => m.AuthCallbackComponent)
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
      }
    ]
  },

  // Barber routes (owner/staff) - with sidebar layout
  {
    path: 'barber',
    canActivate: [authGuard, staffOrOwnerGuard],
    loadComponent: () => import('./layouts/barber-layout/barber-layout.component').then(m => m.BarberLayoutComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'calendar',
        loadComponent: () => import('./features/calendar/calendar.component').then(m => m.CalendarComponent)
      },
      {
        path: 'clients',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/clients/client-list/client-list.component').then(m => m.ClientListComponent)
          },
          {
            path: ':id',
            loadComponent: () => import('./features/clients/client-detail/client-detail.component').then(m => m.ClientDetailComponent)
          }
        ]
      },
      {
        path: 'services',
        canActivate: [ownerGuard],
        children: [
          {
            path: '',
            loadComponent: () => import('./features/services/service-list/service-list.component').then(m => m.ServiceListComponent)
          },
          {
            path: 'new',
            loadComponent: () => import('./features/services/service-form/service-form.component').then(m => m.ServiceFormComponent)
          },
          {
            path: ':id/edit',
            loadComponent: () => import('./features/services/service-form/service-form.component').then(m => m.ServiceFormComponent)
          }
        ]
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },

  // Client routes - with simple header layout
  {
    path: 'client',
    canActivate: [authGuard, clientGuard],
    loadComponent: () => import('./layouts/client-layout/client-layout.component').then(m => m.ClientLayoutComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/client/client-dashboard/client-dashboard.component').then(m => m.ClientDashboardComponent)
      },
      {
        path: 'book',
        loadComponent: () => import('./features/client/book/book.component').then(m => m.BookComponent)
      },
      {
        path: 'reschedule/:id',
        loadComponent: () => import('./features/client/reschedule/reschedule.component').then(m => m.RescheduleComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/profile/profile.component').then(m => m.ProfileComponent)
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },

  // Legacy redirects (for backwards compatibility)
  { path: 'dashboard', redirectTo: 'auth/callback', pathMatch: 'full' },
  { path: 'calendar', redirectTo: 'barber/calendar', pathMatch: 'full' },
  { path: 'clients', redirectTo: 'barber/clients', pathMatch: 'full' },
  { path: 'services', redirectTo: 'barber/services', pathMatch: 'full' },
  { path: 'settings', redirectTo: 'barber/settings', pathMatch: 'full' },
  { path: 'booking', redirectTo: 'client/book', pathMatch: 'full' },
  { path: 'appointments', redirectTo: 'client/dashboard', pathMatch: 'full' },

  // Wildcard
  {
    path: '**',
    redirectTo: 'auth/callback'
  }
];
