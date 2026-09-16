import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { redirectIfAuthenticatedGuard } from './core/auth/redirect-if-authenticated.guard';
import { profileExitGuard } from './features/user/profile/profile-exit.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then(m => m.Home),
    canActivate: [authGuard]
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login),
    canActivate: [redirectIfAuthenticatedGuard]
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then(m => m.Register)
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then(m => m.ForgotPassword)
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then(m => m.ResetPassword)
  },
  {
    path: 'tasks',
    loadComponent: () => import('./features/tasks/task-list/task-list').then(m => m.TaskList),
    canActivate: [authGuard]
  },
  {
    path: 'tasks/new',
    loadComponent: () => import('./features/tasks/task-form/task-form').then(m => m.TaskForm),
    canActivate: [authGuard]
  },
  {

    path: 'tasks/:id/edit',
    loadComponent: () => import('./features/tasks/task-form/task-form').then(m => m.TaskForm),
    canActivate: [authGuard]
  },
  {
    path: 'tasks/:id',
    loadComponent: () => import('./features/tasks/task-detail/task-detail').then(m => m.TaskDetail),
    canActivate: [authGuard]
  },
  {

    path: 'finance',
    loadComponent: () => import('./features/finance/overview/overview').then(m => m.Overview),
    canActivate: [authGuard]
  },
  {
    path: 'finance/new',
    loadComponent: () =>
      import('./features/finance/transaction-form/transaction-form').then(m => m.TransactionForm),
    canActivate: [authGuard]
  },
  {
    path: 'finance/history',
    loadComponent: () =>
      import('./features/finance/transaction-history/transaction-history').then(
        m => m.TransactionHistory
      ),
    canActivate: [authGuard]
  },
  {
    path: 'finance/:id/edit',
    loadComponent: () =>
      import('./features/finance/transaction-form/transaction-form').then(m => m.TransactionForm),
    canActivate: [authGuard]
  },
  {
    path: 'finance/:id',
    loadComponent: () =>
      import('./features/finance/transaction-detail/transaction-detail').then(
        m => m.TransactionDetail
      ),
    canActivate: [authGuard]
  },
  {
    path: 'habits',
    loadComponent: () => import('./features/habits/habit-list/habit-list').then(m => m.HabitList),
    canActivate: [authGuard]
  },
  {
    path: 'habits/:id/edit',
    loadComponent: () => import('./features/habits/habit-edit/habit-edit').then(m => m.HabitEdit),
    canActivate: [authGuard]
  },
  {
    path: 'habits/:id',
    loadComponent: () =>
      import('./features/habits/habit-detail/habit-detail').then(m => m.HabitDetail),
    canActivate: [authGuard]
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/user/profile/profile').then(m => m.Profile),
    canActivate: [authGuard],
    canDeactivate: [profileExitGuard]
  },
  {
    path: 'profile/edit',
    loadComponent: () =>
      import('./features/user/profile-edit/profile-edit').then(m => m.ProfileEdit),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];

