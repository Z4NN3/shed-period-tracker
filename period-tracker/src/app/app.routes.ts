
import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [

  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'welcome'
  },

  // LOGIN / CREATE ACCOUNT FIRST
  {
    path: 'welcome',
    loadComponent: () =>
      import('./pages/welcome/welcome.page')
        .then(m => m.WelcomePage)
  },

  // PROTECTED MAIN APPLICATION
  {
    path: 'tabs',
    canActivate: [authGuard],
    canActivateChild: [authGuard],

    loadComponent: () =>
      import('./tabs/tabs.page')
        .then(m => m.TabsPage),

    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.page')
            .then(m => m.DashboardPage)
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./pages/calendar/calendar.page')
            .then(m => m.CalendarPage)
      },
      {
        path: 'track',
        loadComponent: () =>
          import('./pages/track/track.page')
            .then(m => m.TrackPage)
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./pages/history/history.page')
            .then(m => m.HistoryPage)
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/profile/profile.page')
            .then(m => m.ProfilePage)
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      }
    ]
  },

  {
    path: '**',
    redirectTo: 'welcome'
  }
];
