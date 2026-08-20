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
   * El atributo `d` del `<path>` del icono, en el viewBox 24×24 con trazo que
   * ya usa `theme-toggle`.
   *
   * El icono viaja con el enlace en vez de vivir en cada plantilla porque el
   * punto de esta constante es que `sidebar-nav` y `bottom-nav` no puedan
   * divergir. Un `id` de icono más un `@switch` por componente reintroduciría
   * exactamente la duplicación que esto viene a evitar, en dos sitios en vez
   * de uno.
   */
  readonly icon: string;
}

/**
 * La navegación principal, declarada una sola vez.
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
    icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M9 21v-6h6v6'
  },
  {
    path: '/tasks',
    label: 'Tareas',
    exact: false,
    icon: 'M9 6h11 M9 12h11 M9 18h11 M4 6l1.4 1.4L8 4.8 M4 12l1.4 1.4L8 10.8 M4 18l1.4 1.4L8 16.8'
  },
  {
    path: '/finance',
    label: 'Finanzas',
    exact: false,
    icon: 'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2 M3 8v9a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3 M21 10v4h-4a2 2 0 0 1 0-4z'
  }
];
