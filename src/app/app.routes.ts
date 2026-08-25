import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then(m => m.Home),
    canActivate: [authGuard]
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then(m => m.Register)
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
    // Va DESPUES de 'tasks/new' a proposito: el router evalua de arriba abajo y
    // ':id' coincide con cualquier segmento, asi que puesto antes se tragaria
    // /tasks/new y el formulario de creacion seria inalcanzable — con un id
    // "new" que ni siquiera es un numero. Es el mismo fallo silencioso que el
    // comodin de abajo, y `ng build` tampoco lo detecta.
    path: 'tasks/:id',
    loadComponent: () => import('./features/tasks/task-detail/task-detail').then(m => m.TaskDetail),
    canActivate: [authGuard]
  },
  {
    // Marcador de posición: la feature no está construida, pero el nav ya la
    // ofrece y un enlace sin ruta caería en el comodín de abajo, devolviendo
    // al usuario a Inicio en silencio.
    path: 'finance',
    loadComponent: () => import('./features/finance/overview/overview').then(m => m.Overview),
    canActivate: [authGuard]
  },
  {
    // Tiene que ser SIEMPRE la última entrada: el router evalúa de arriba
    // abajo y `**` coincide con todo, así que cualquier ruta puesta después
    // queda inalcanzable sin que `ng build` diga nada.
    path: '**',
    redirectTo: ''
  }
];

