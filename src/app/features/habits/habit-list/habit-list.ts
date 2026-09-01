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
import { PushService } from '../../../core/notifications/push.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { HabitRequest, HabitResponse } from '../models/habit.model';
import { HabitService } from '../habit.service';

/** Tope de `HabitRequest.name` segun `/v3/api-docs`. */
const NAME_MAX_LENGTH = 100;

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
 * **Lo marcado hoy lo dice el servidor** (`HabitResponse.isCompletedToday`,
 * anadido al backend el 2026-08-31). Esta pantalla no recuerda nada por su
 * cuenta: el estado del check sale de la misma respuesta que la racha, asi que
 * cruza de dispositivo y sobrevive a una recarga sin ningun almacenamiento
 * local.
 *
 * Hubo un apano en `localStorage` (`completed-today.ts`) mientras el campo no
 * existia. Se borro con este refactor y **no debe volver**: dos fuentes para el
 * mismo hecho es como se acaba con un check verde en un dispositivo y gris en
 * otro.
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

  /**
   * Publico para la plantilla, que lee `supported`/`status`/`busy`/`error`
   * directamente del servicio en vez de duplicarlos en signals locales.
   *
   * El permiso de notificaciones es estado del navegador, global y unico: una
   * copia por pantalla es como esta tarjeta y una futura pantalla de ajustes
   * acabarian mostrando cosas distintas sin que ninguna estuviera mal.
   */
  protected readonly push = inject(PushService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  private readonly all = signal<HabitResponse[]>([]);
  protected readonly loading = signal(true);

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

  /**
   * `maxLength(100)` porque la spec viva declara ese tope en
   * `HabitRequest.name`: sin el, un nombre largo se manda igual y vuelve como
   * 400 — un error de servidor por algo que el navegador ya sabia.
   *
   * El input lleva ademas el atributo `maxlength` nativo, que **impide** pasarse
   * en vez de avisar despues. El validador se queda como red: el atributo no
   * cubre un pegado por programa ni un valor puesto desde el codigo, y sin el
   * `form.invalid` no seria cierto.
   */
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]]
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

  /**
   * Cuantos quedan por marcar hoy, para el resumen de la cabecera.
   *
   * Se deriva de la lista con un `computed`, no de un contador aparte: hay una
   * sola fuente —lo que devolvio el servidor— y cualquier cosa que cambie
   * `all()` (cargar, crear, marcar) lo actualiza sin acordarse de nada.
   */
  protected readonly pendingToday = computed(
    () => this.all().filter(habit => !habit.isCompletedToday).length
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

  /**
   * Se expone para que la plantilla ponga el `maxlength` nativo en el input.
   * Que el tope viva en una sola constante evita que el atributo y el validador
   * digan cosas distintas.
   */
  protected readonly nameMaxLength = NAME_MAX_LENGTH;

  protected isDone(habit: HabitResponse): boolean {
    return habit.isCompletedToday;
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
        // La respuesta del POST ya trae `isCompletedToday: true` y la racha
        // recalculada, asi que sustituir la fila deja la tarjeta en su estado
        // final sin tocar nada mas ni volver a pedir la lista.
        this.all.update(habits => habits.map(h => (h.id === updated.id ? updated : h)));
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

  /**
   * Pide el permiso y registra el dispositivo.
   *
   * **Sale de un clic y de ningun otro sitio.** Pedir el permiso al montar la
   * pantalla es como se consigue que el usuario pulse "Bloquear" sin leer, y
   * `denied` no se puede revertir desde la pagina: a partir de ahi la unica
   * salida es el candado de la barra de direcciones.
   *
   * El servicio ya guarda el error en su propio signal —lo pinta la plantilla
   * en un `role="alert"`, como el resto de la app—, asi que aqui solo queda el
   * anuncio del exito, que nadie mas cubre: al concederse el permiso el unico
   * cambio visible es que el texto de la fila cambia.
   */
  protected async onEnableNotifications(): Promise<void> {
    await this.push.enable();

    if (this.push.subscribed() && !this.push.error()) {
      this.statusMessage.set('Recordatorios activados en este dispositivo.');
    }
  }

  /**
   * Baja del dispositivo: lo borra del backend y cancela la suscripcion del
   * navegador.
   *
   * **No revoca el permiso**, porque ninguna API lo permite. Volver a activar
   * despues ya no vuelve a preguntar nada, que es justo lo que se quiere: la
   * pregunta del permiso es irrepetible y gastarla en cada ida y vuelta seria
   * arriesgar un `denied` permanente.
   */
  protected async onDisableNotifications(): Promise<void> {
    await this.push.disable();

    if (!this.push.subscribed() && !this.push.error()) {
      this.statusMessage.set('Recordatorios desactivados en este dispositivo.');
    }
  }

  /**
   * Notificacion local de prueba, sin pasar por el backend.
   *
   * Separa dos fallos que desde fuera se ven igual: que el canal no este
   * montado, o que lo este y el backend no mande nada.
   */
  protected async onTestNotification(): Promise<void> {
    await this.push.showTest();

    if (!this.push.error()) {
      this.statusMessage.set('Notificación de prueba enviada.');
    }
  }
}
