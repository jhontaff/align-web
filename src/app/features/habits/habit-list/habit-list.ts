import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataRefreshService } from '../../../core/data/data-refresh.service';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { Icon } from '../../../shared/ui/icon/icon';
import { markCompletedToday, readCompletedToday } from '../completed-today';
import { HabitRequest, HabitResponse } from '../models/habit.model';
import { HabitService } from '../habit.service';

/**
 * Listado de habitos: una tarjeta por habito, con alta en linea.
 *
 * **Cada tarjeta lleva el nombre arriba y, abajo, el check del dia con la racha
 * a su derecha.** El check es la accion principal de la pantalla —lo que se
 * hace a diario es marcar, no leer— y por eso ocupa el pie de la tarjeta, que
 * es la zona de accion; el nombre queda arriba como titulo.
 *
 * **La racha solo se ve con el dia marcado.** Es una decision de producto, no
 * un descuido: convierte el numero en la recompensa del gesto en vez de en un
 * dato de fondo. Su hueco se reserva igualmente (`visibility`, no `display`),
 * asi que revelarla no mueve nada de sitio — la tarjeta no da un salto justo
 * cuando el dedo acaba de tocarla.
 *
 * **El alta va aqui dentro y no en una ruta `/habits/new`**, que seria el
 * espejo de `task-form/`. `HabitRequest` tiene un solo campo, y el flujo real
 * al empezar es dar de alta varios seguidos: con una pantalla aparte eso son
 * tres navegaciones de ida y vuelta, mientras que en linea el foco vuelve al
 * campo y se sigue escribiendo. `task-form` es una ruta porque `TaskRequest`
 * tiene cinco campos, fecha, hora y prioridad — no por simetria.
 *
 * **Sin paginacion**: `GET /api/habits` devuelve el array completo, a
 * diferencia de Tareas y Finanzas. No hay `Page<T>` ni `totalElements`.
 *
 * ---
 *
 * **Lo marcado hoy sale de `localStorage`, no del backend**, porque
 * `HabitResponse` no lo reporta. Ver `../completed-today.ts`: es un apano con
 * fecha de caducidad, y el arreglo real es un campo `completedToday: boolean`
 * en la respuesta. Mientras tanto, marcar en el movil no pinta el check en el
 * portatil.
 */
@Component({
  selector: 'app-habit-list',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './habit-list.html',
  styleUrl: './habit-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HabitList implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly habits = inject(HabitService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  private readonly all = signal<HabitResponse[]>([]);
  protected readonly loading = signal(true);

  /**
   * Ids marcados hoy. Se siembra desde `localStorage` al construir para que una
   * recarga no apague todos los checks — ver la nota de arriba.
   */
  private readonly doneToday = signal<ReadonlySet<string>>(readCompletedToday());

  /**
   * Dos signals de error, no uno.
   *
   * `createError` se pinta dentro del formulario y `errorMessage` sobre la
   * lista: un fallo al dar de alta y un fallo al cargar o al marcar no ocurren
   * en el mismo sitio de la pantalla, y fundirlos dejaria el mensaje del alta
   * flotando lejos del campo que lo provoco.
   */
  protected readonly createError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly submitting = signal(false);

  /**
   * Id del habito que se esta marcando ahora mismo, o `null`. Es un id y no un
   * booleano porque hay un check por tarjeta: un `completing` global bloquearia
   * todos y el usuario no sabria cual esta en vuelo. Mismo criterio que
   * `deletingId` en `TaskList`.
   */
  protected readonly completingId = signal<string | null>(null);

  /** Lo ultimo confirmado, para la region `role="status"`. */
  protected readonly statusMessage = signal('');

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]]
  });

  /**
   * Orden alfabetico, **no por racha**.
   *
   * Ordenada por racha, marcar un habito le sube el numero y la tarjeta salta
   * de sitio bajo el dedo justo despues de tocarla. Un inventario se ordena
   * para encontrar cosas, no para rankearlas.
   *
   * Que la tarjeta de Inicio siga ordenando por racha no es una incoherencia:
   * alli son los tres primeros de un ranking declarado, aqui es la lista
   * completa.
   *
   * `localeCompare` con el locale inyectado, no `<`: comparar cadenas con el
   * operador usa orden de puntos de codigo, donde la N con virgulilla cae
   * despues de la Z y las acentuadas van a otro bloque. Es el tipo de fallo que
   * solo se ve con datos reales en espanol.
   *
   * **Se copia antes de ordenar**: `Array.sort` ordena en su sitio y este array
   * es el valor de un signal — mutarlo lo cambiaria por debajo sin notificar,
   * que con `OnPush` es una lista que deja de repintarse.
   */
  protected readonly sorted = computed(() =>
    [...this.all()].sort((a, b) => a.name.localeCompare(b.name, this.locale))
  );

  /** Cuantos quedan por marcar hoy, para el resumen de la cabecera. */
  protected readonly pendingToday = computed(
    () => this.all().filter(habit => !this.doneToday().has(habit.id)).length
  );

  ngOnInit(): void {
    this.load();

    // El agente todavia no tiene herramientas de habitos, asi que hoy este
    // stream no dispara nada por esta via. Se suscribe igual porque el dia que
    // las tenga la pantalla ya estara al dia sin tocarla, y el coste es una
    // suscripcion. `takeUntilDestroyed` es obligatorio: un Subject no completa
    // nunca, asi que sin esto cada visita dejaria otra viva.
    this.dataRefresh.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  private load(): void {
    this.errorMessage.set(null);

    this.habits.list().subscribe({
      next: habits => {
        this.all.set(habits);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  protected isDone(habit: HabitResponse): boolean {
    return this.doneToday().has(habit.id);
  }

  /**
   * El habito nuevo se anade al array local con la respuesta del servidor, sin
   * recargar: el POST ya devuelve el `HabitResponse` completo —con su `id` y su
   * `currentStreak` en 0— asi que un GET extra solo anadiria un parpadeo. Es lo
   * mismo que hace `TaskList` al borrar.
   */
  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.createError.set(null);

    this.habits.create(this.form.getRawValue() as HabitRequest).subscribe({
      next: habit => {
        this.all.update(habits => [...habits, habit]);
        this.form.reset();
        this.submitting.set(false);
        this.statusMessage.set(`Habito "${habit.name}" creado.`);

        // El foco vuelve al campo para poder encadenar altas. Sin esto, quien
        // pulso el boton con el raton se queda con el foco en el boton y tiene
        // que volver al campo a mano en cada habito que anada.
        this.nameInput()?.nativeElement.focus();
      },
      error: err => {
        this.submitting.set(false);
        this.createError.set(extractErrorMessage(err));
      }
    });
  }

  /**
   * La tarjeta se sustituye con la respuesta, que trae la racha ya recalculada
   * por el servidor. **No se incrementa `currentStreak` en local**: la fecha de
   * corte la decide el backend con su reloj y su zona, y una segunda version
   * del calculo aqui divergiria de la suya a la primera medianoche.
   *
   * El guard de entrada sustituye al atributo `disabled` del boton. Se usa
   * `aria-disabled` en la plantilla y no `disabled` porque un boton
   * deshabilitado sale del orden de tabulacion y desaparece para quien navega
   * con teclado: en vez de encontrarse un control que anuncia "ya marcado", se
   * encuentra con que la tarjeta no tiene nada dentro. Como `aria-disabled` no
   * impide el clic, el bloqueo real tiene que estar aqui.
   */
  protected onComplete(habit: HabitResponse): void {
    if (this.isDone(habit) || this.completingId() === habit.id) {
      return;
    }

    this.completingId.set(habit.id);
    this.errorMessage.set(null);

    this.habits.complete(habit.id).subscribe({
      next: updated => {
        this.all.update(habits => habits.map(h => (h.id === updated.id ? updated : h)));
        this.doneToday.set(markCompletedToday(updated.id));
        this.completingId.set(null);

        // El cambio visible es un color y un numero que aparece. Sin este
        // anuncio, quien no ve la pantalla no tiene forma de saber que la
        // accion surtio efecto.
        this.statusMessage.set(`${updated.name} marcado. ${this.streakLabel(updated)}.`);
      },
      error: err => {
        this.completingId.set(null);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  /**
   * "5 dias" / "1 dia" / "Sin racha".
   *
   * Solo para lectores de pantalla y para la region de estado: en pantalla la
   * racha se pinta como numero grande mas la unidad en pequeno, que ocupa menos
   * en el pie de la tarjeta.
   *
   * Una racha de 0 no se escribe "0 dias": el cero se lee como una medida
   * cuando lo que dice en realidad es que el habito esta parado.
   */
  protected streakLabel(habit: HabitResponse): string {
    if (habit.currentStreak === 0) {
      return 'Sin racha';
    }

    return habit.currentStreak === 1 ? '1 día' : `${habit.currentStreak} días`;
  }

  /** "días" / "día", la unidad suelta que acompana al numero grande. */
  protected streakUnit(habit: HabitResponse): string {
    return habit.currentStreak === 1 ? 'día' : 'días';
  }
}
