import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withRouterConfig
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { unwrapInterceptor } from './core/interceptors/unwrap-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,

      // Los parámetros de ruta llegan como `input()` al componente, sin inyectar
      // ActivatedRoute. Necesario para /tasks/:id/edit, la primera ruta con
      // parámetro que entra.
      withComponentInputBinding(),

      // Sin esto el router no toca el scroll: navegar de una lista larga a un
      // detalle deja la página a media altura, y el "atrás" no recupera dónde
      // estabas. Importa más cuanto más larga es la lista.
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled'
      }),

      // Hace visibles los params y la data del padre en las rutas hijas. Es la
      // pieza que falta para que withComponentInputBinding funcione en las
      // pantallas anidadas de Finance (overview / activity).
      withRouterConfig({ paramsInheritanceStrategy: 'always' })
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    provideHttpClient(withInterceptors([authInterceptor, unwrapInterceptor]))
  ]
};
