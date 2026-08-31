import { IconName } from '../shared/ui/icon/icon-set';

/** Un destino de la navegación principal. */
export interface NavLink {
  /** Ruta absoluta, tal cual la declara `app.routes.ts`. */
  readonly path: string;
  readonly label: string;
  /**
   * Si `routerLinkActive` debe exigir coincidencia exacta.
   *
   * Solo la raíz lo necesita: por defecto la directiva marca activo cualquier
   * prefijo, y `/` es prefijo de absolutamente todo, así que sin esto "Inicio"
   * se queda encendido también en `/tasks` y en `/finance`.
   */
  readonly exact: boolean;
  /**
   * El icono, como nombre del set de Bootstrap Icons vía Iconify.
   *
   * Viaja con el enlace en vez de vivir en cada plantilla porque el punto de
   * esta constante es que `sidebar-nav` y `bottom-nav` no puedan divergir. Un
   * `id` propio más un `@switch` por componente reintroduciría exactamente la
   * duplicación que esto viene a evitar, en dos sitios en vez de uno.
   *
   * El tipo es `IconName` y no `string`: una errata aquí es un error de
   * compilación, no un hueco vacío en las dos navegaciones a la vez.
   */
  readonly icon: IconName;
}

/**
 * La navegación principal, declarada una sola vez.
 *
 * Anadir un destino aqui lo pinta en las DOS navegaciones y en ningun otro
 * sitio hay que tocar nada — pero exige que la ruta exista en `app.routes.ts`:
 * un enlace sin ruta cae en el comodin `**` y devuelve al usuario a Inicio en
 * silencio, sin error de compilacion y sin nada que mirar en consola.
 *
 * `sidebar-nav` (≥ desktop) y `bottom-nav` (< desktop) son dos componentes
 * porque su marcado y su semántica accesible son distintos, pero consumen
 * esta misma lista: es la pieza que impide que añadir una feature deje un
 * enlace puesto en una nav y olvidado en la otra.
 *
 * Vive en `layout/` y no en `core/`: `core/` es lógica sin UI, y esto es la
 * definición del cromo del shell.
 */
export const NAV_LINKS: readonly NavLink[] = [
  {
    path: '/',
    label: 'Inicio',
    exact: true,
    icon: 'bi:house-door'
  },
  {
    path: '/tasks',
    label: 'Tareas',
    exact: false,
    icon: 'bi:check2-circle'
  },
  {
    path: '/finance',
    label: 'Finanzas',
    exact: false,
    icon: 'bi:wallet2'
  },
  {
    path: '/habits',
    label: 'Hábitos',
    exact: false,
    icon: 'bi:calendar-check'
  }
];
