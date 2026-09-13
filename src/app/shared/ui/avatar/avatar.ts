import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

type GazeModule = {
  Style: typeof import('@dicebear/core').Style;
  Avatar: typeof import('@dicebear/core').Avatar;
  gaze: unknown;
};

let gazeModule: Promise<GazeModule> | null = null;

// Carga perezosa: @dicebear/core no debe pesar en el bundle inicial del shell
// (AppHeader, que monta este componente, es eager).
function loadGaze(): Promise<GazeModule> {
  gazeModule ??= Promise.all([import('@dicebear/core'), import('@dicebear/styles/gaze.json')]).then(
    ([core, gaze]) => ({ Style: core.Style, Avatar: core.Avatar, gaze: gaze.default })
  );

  return gazeModule;
}

/**
 * Avatar circular, tonto: sin inyección de servicios.
 *
 * `photoUrl` existe desde hoy aunque todo consumidor le pase `null` por ahora
 * (no hay UI de subida todavía) — el día que exista, este componente no cambia.
 */
@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Avatar {
  /** Identificador opaco (el id del usuario). No hace falta hashearlo. */
  readonly seed = input.required<string>();

  readonly photoUrl = input<string | null>(null);

  /** Diámetro en píxeles. */
  readonly size = input<number>(40);

  private readonly generatedDataUri = signal<string | null>(null);

  protected readonly src = computed(() => this.photoUrl() ?? this.generatedDataUri());

  constructor() {
    // Dispara la carga perezosa al cambiar el seed. El resultado llega async
    // (una promesa), no sincroniza dos signals dentro del mismo ciclo.
    effect(() => {
      const seed = this.seed();

      void loadGaze().then(({ Style, Avatar: DicebearAvatar, gaze }) => {
        this.generatedDataUri.set(new DicebearAvatar(new Style(gaze), { seed }).toDataUri());
      });
    });
  }
}
