import {
  ApplicationConfig,
  DEFAULT_CURRENCY_CODE,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  isDevMode
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
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

// Angular trae `en-US` compilado por defecto y los demás locales hay que
// registrarlos a mano; sin esto `CurrencyPipe` y `DatePipe` formatean a la
// inglesa (`$1,234.56`) por mucho que el texto de la app esté en español.
//
// `es-ES` no es una elección nueva: `task-list.ts` ya formatea las fechas de
// vencimiento con `toLocaleDateString('es-ES', ...)`. Esto solo lo convierte en
// la configuración de la app en vez de en una cadena suelta dentro de un
// componente.
registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),

    { provide: LOCALE_ID, useValue: 'es-ES' },

    // El backend manda `amount` como número pelado, sin moneda: no hay ningún
    // campo del que deducirla, así que la decide el frontend. Va aquí y no en
    // cada `| currency:'EUR'` de cada plantilla para que cambiar de divisa sea
    // una línea y no una búsqueda global.
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'EUR' },

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
