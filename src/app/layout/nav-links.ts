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
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8.2 12.1l2.6 2.6 5-5.2'
  },
  {
    path: '/finance',
    label: 'Finanzas',
    exact: false,
    icon: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M5.5 10.5v3 M18.5 10.5v3'
  }
];
