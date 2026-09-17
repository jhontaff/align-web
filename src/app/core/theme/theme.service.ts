import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';

/** El tema que realmente se pinta. */
export type Theme = 'light' | 'dark';

/** Lo que el usuario eligió. `system` = delegar en el sistema operativo. */
export type ThemePreference = Theme | 'system';

const THEME_KEY = 'align_theme';

/**
 * Duplicado a propósito respecto del script inline de `index.html` (que fija
 * el theme-color antes de que exista este bundle, para evitar el flash al
 * abrir la PWA instalada en frío). No hay forma de compartir una constante
 * entre HTML puro y TS sin build tooling extra.
 */
const THEME_COLORS: Record<Theme, string> = { light: '#f8fafc', dark: '#0c1324' };

/** Orden del ciclo del botón. `system` primero porque es el estado inicial. */
const CYCLE: readonly ThemePreference[] = ['system', 'light', 'dark'];

/**
 * Estado del tema de la app.
 *
 * `system` es un estado de primera clase, no la ausencia de elección: alguien
 * con auto-dark en el SO tiene que poder volver a delegar en él después de
 * haber probado los otros dos.
 *
 * Este servicio es el único sitio de la app que escribe `data-theme` en <html>;
 * los tokens de `styles/_tokens.scss` hacen todo lo demás.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);

  /** Lo que el sistema operativo pide ahora mismo. */
  private readonly systemTheme = signal<Theme>(this.readSystemTheme());

  private readonly _preference = signal<ThemePreference>(readStoredPreference());

  /**
   * La elección del usuario, solo lectura.
   *
   * Escribible únicamente a través de `cycle()` / `setPreference()`, porque
   * cambiar la preferencia y persistirla en localStorage son la misma
   * operación: un `.set()` suelto desde fuera dejaría el tema aplicado pero
   * perdido en la siguiente recarga.
   */
  readonly preference = this._preference.asReadonly();

  /** El tema realmente aplicado, ya resuelto. */
  readonly theme = computed<Theme>(() => {
    const preference = this.preference();
    return preference === 'system' ? this.systemTheme() : preference;
  });

  constructor() {
    this.watchSystemTheme();

    // Proyección al DOM, y el único escritor de `data-theme` en toda la app.
    //
    // Con `system` el atributo se BORRA, no se escribe el valor resuelto:
    // dejarlo ausente es lo que permite que `@media (prefers-color-scheme)` de
    // _tokens.scss siga mandando. Escribir el valor resuelto clavaría la app al
    // tema que hubiera en el arranque y `system` dejaría de significar nada.
    //
    // El theme-color de la barra de estado del PWA instalado va en el mismo
    // efecto porque depende del mismo `theme()` resuelto: las dos escrituras
    // siempre cambian juntas. A diferencia de `data-theme`, aquí sí se escribe
    // también en `system` — no hay un `@media` que resuelva la meta por sí
    // sola, y sin esto la barra de estado seguiría al SO en vez de al tema
    // real de la app.
    effect(() => {
      const preference = this.preference();
      const root = this.document.documentElement;

      if (preference === 'system') {
        delete root.dataset['theme'];
      } else {
        root.dataset['theme'] = preference;
      }

      this.meta.updateTag({ content: THEME_COLORS[this.theme()] }, 'name="theme-color"');
    });
  }

  /** Avanza al siguiente estado del ciclo: sistema → claro → oscuro → sistema. */
  cycle(): void {
    this.setPreference(CYCLE[(CYCLE.indexOf(this.preference()) + 1) % CYCLE.length]);
  }

  setPreference(preference: ThemePreference): void {
    this._preference.set(preference);
    localStorage.setItem(THEME_KEY, preference);
  }

  private readSystemTheme(): Theme {
    return this.prefersDarkQuery()?.matches ? 'dark' : 'light';
  }

  private watchSystemTheme(): void {
    this.prefersDarkQuery()?.addEventListener('change', event => {
      this.systemTheme.set(event.matches ? 'dark' : 'light');
    });
  }

  private prefersDarkQuery(): MediaQueryList | undefined {
    return this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
  }
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}
