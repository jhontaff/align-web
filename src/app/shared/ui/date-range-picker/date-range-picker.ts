import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import {
  DateRange,
  DateRangePreset,
  addDays,
  formatDateRange,
  lastDayOfMonth,
  orderedRange,
  parseIsoDate,
  toIsoDate
} from '../../../core/date/date-range';
import { Icon } from '../icon/icon';

/**
 * Contador de instancias, para que cada picker tenga ids propios.
 *
 * Mismo motivo que en `confirm-dialog`: `id` es global al documento y la
 * encapsulación de Angular reescribe selectores CSS, no atributos `id`. Con ids
 * fijos, dos pickers montados a la vez —resumen y movimientos, en cuanto exista
 * la segunda pantalla— harían que `aria-controls` del segundo apuntara al
 * popover del primero.
 */
let nextId = 0;

/** Una casilla de la rejilla. Todas son fechas reales, también las de relleno. */
interface DayCell {
  readonly iso: string;
  readonly day: number;
  /** De un mes vecino, pintada tenue. Sigue siendo seleccionable. */
  readonly outside: boolean;
  readonly isToday: boolean;
  /** "12 de septiembre de 2026" — el nombre accesible del botón. */
  readonly label: string;
}

interface Weekday {
  readonly narrow: string;
  readonly long: string;
}

/**
 * Selector de rango de fechas: un botón que despliega un calendario donde se
 * marcan dos extremos, más los atajos que le pase quien lo monta.
 *
 * Primitiva de `shared/ui/`, y cumple sus dos reglas: recibe un `DateRange`
 * —dos cadenas ISO, no un DTO de dominio— y no inyecta ningún servicio de
 * negocio. No sabe que existe Finanzas; los atajos ("Este mes") entran por
 * `input()` porque *qué periodos se ofrecen* es una decisión de la pantalla.
 *
 * **Excepción consciente a la regla del segundo uso.** `shared/ui/` se puebla
 * al segundo consumidor, nunca al primero, porque con uno solo la API se
 * adivina. Hoy el único consumidor real es `finance/overview/`; el segundo
 * (`finance/activity/`) todavía no existe. Se construye aquí por decisión
 * explícita, así que la API de abajo es una apuesta y no una deducción — es
 * normal que haya que ajustarla cuando entre el segundo.
 *
 * **No es modal.** A diferencia de `confirm-dialog` y `session-menu`, que usan
 * `<dialog>` + `showModal()`, este popover va anclado a su botón y deja ver lo
 * que hay detrás: es que las cifras que el usuario está eligiendo acotar están
 * justo ahí. El precio es que el cierre con Escape, el clic fuera y la salida
 * con el tabulador hay que escribirlos, y están abajo.
 */
@Component({
  selector: 'app-date-range-picker',
  imports: [Icon],
  templateUrl: './date-range-picker.html',
  styleUrl: './date-range-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'onEscape($event)',
    '(focusout)': 'onFocusOut($event)'
  }
})
export class DateRangePicker {
  /**
   * El rango aplicado, o `null` cuando no hay ninguno.
   *
   * **`null` es un estado de primera clase, no la ausencia de valor** — la
   * misma distinción que hace `ThemePreference` con `'system'`. "Sin filtro" no
   * es un rango más: se expresa quitando `from`/`to` de la petición, y
   * `date-ranges.ts` ya rechazó meterlo como preset por eso mismo. El input
   * sigue siendo `required` para que quien monta el componente tenga que
   * decidir explícitamente, en vez de heredar un `undefined` por olvido.
   *
   * Este es el ajuste de API que el comentario de la clase anunciaba para el
   * segundo consumidor: `finance/transaction-history/` arranca sin filtro, y
   * con un `DateRange` obligatorio la única salida era pasarle un rango que no
   * está aplicado — o sea, un botón que miente sobre lo que se está viendo.
   */
  readonly range = input.required<DateRange | null>();

  /** Atajos opcionales. Sin ellos el popover es solo el calendario. */
  readonly presets = input<readonly DateRangePreset[]>([]);

  /**
   * Qué acota el rango, para el nombre accesible del botón ("Periodo:
   * septiembre de 2026"). Se llama `label` y no `title` porque `title` es una
   * propiedad nativa del DOM y colisionaría con el atributo del anfitrión.
   */
  readonly label = input('Periodo');

  /**
   * Qué dice el botón cuando no hay rango. Se pasa desde fuera porque lo que
   * significa "sin filtro" depende de la pantalla: aquí es "todo el historial",
   * en otra podría ser "cualquier fecha".
   */
  readonly emptyLabel = input('Todo el periodo');

  /**
   * Si el popover ofrece quitar el filtro. Apagado por defecto: en el resumen
   * no hay estado sin rango al que volver —siempre hay un periodo aplicado— y
   * ofrecer la acción ahí prometería algo que la pantalla no sabe hacer.
   */
  readonly clearable = input(false);

  /**
   * Se emite **solo con un rango completo**: al pulsar un atajo, o al cerrar
   * los dos extremos en el calendario. Nunca a medias — quien escucha esto
   * dispara una petición, y un rango con un solo extremo no es una pregunta
   * que se le pueda hacer al backend.
   */
  readonly rangeChange = output<DateRange>();

  /**
   * Quitar el filtro. Evento aparte y no un `rangeChange` con `null` porque
   * son dos acciones distintas —acotar y dejar de acotar—, y fundirlas
   * obligaría al resumen, que no puede quitar el filtro, a escribir un guard
   * para un caso que en su pantalla no ocurre nunca.
   */
  readonly clear = output<void>();

  /**
   * El locale se inyecta en vez de escribir `'es-ES'` a mano: ya está declarado
   * una vez en `app.config.ts`. De él salen los nombres de mes, los de los días
   * de la semana y las etiquetas de cada casilla, así que este componente no
   * tiene ni una cadena en español dentro salvo las de su propia interfaz.
   */
  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly id = nextId++;
  protected readonly panelId = `date-range-picker-panel-${this.id}`;
  protected readonly monthId = `date-range-picker-month-${this.id}`;

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly open = signal(false);

  /**
   * El primer extremo de una selección en curso, o `null` si no hay ninguna.
   *
   * Es el estado que convierte dos clics sueltos en un rango, y el que hace que
   * el pie del popover pueda decir "elige la fecha de fin" en vez de dejar al
   * usuario adivinando por qué no ha pasado nada.
   */
  private readonly anchor = signal<string | null>(null);

  /** Día bajo el cursor, solo para la previsualización del tramo. */
  private readonly hovered = signal<string | null>(null);

  /** Primer día del mes que se está pintando. */
  private readonly visibleMonth = signal(startOfMonth(new Date()));

  /**
   * El día que tiene el `tabindex="0"`.
   *
   * Una rejilla de 42 botones con todos tabulables obligaría a pulsar Tab
   * decenas de veces para cruzarla. El patrón es tabindex móvil: uno solo entra
   * en el orden de tabulación y las flechas mueven el foco dentro.
   */
  protected readonly focusedIso = signal(toIsoDate(new Date()));

  /**
   * Bandera plana, no signal, a propósito.
   *
   * Pide al `afterRenderEffect` de abajo que lleve el foco del DOM al día
   * enfocado. Si fuera un signal habría que apagarlo *dentro* del efecto, y
   * escribir un signal desde un efecto es justo lo que las convenciones del
   * repo prohíben. Como campo plano, el efecto lo consume y lo apaga sin
   * disparar otro ciclo de detección.
   */
  private shouldFocusDay = false;

  protected readonly triggerLabel = computed(() => {
    const range = this.range();
    return range ? formatDateRange(range, this.locale) : this.emptyLabel();
  });

  protected readonly monthLabel = computed(() => {
    const text = this.visibleMonth().toLocaleDateString(this.locale, {
      month: 'long',
      year: 'numeric'
    });
    return text.charAt(0).toLocaleUpperCase(this.locale) + text.slice(1);
  });

  /**
   * Lo que se pinta marcado: el rango aplicado cuando no hay selección en
   * curso, y el tramo entre el ancla y el día señalado cuando la hay.
   *
   * El extremo móvil es el ratón **o el foco del teclado**, no solo el ratón:
   * sin eso, quien recorre el calendario con las flechas elige el segundo
   * extremo a ciegas.
   */
  protected readonly preview = computed<DateRange | null>(() => {
    const anchor = this.anchor();
    if (!anchor) {
      return this.range();
    }
    return orderedRange(anchor, this.hovered() ?? this.focusedIso());
  });

  protected readonly selecting = computed(() => this.anchor() !== null);

  protected readonly previewLabel = computed(() => {
    const preview = this.preview();
    return preview ? formatDateRange(preview, this.locale) : this.emptyLabel();
  });

  /**
   * Las cabeceras, derivadas del locale y no escritas a mano.
   *
   * **La semana empieza en lunes**, fijo. Sacarlo del locale exigiría
   * `Intl.Locale.prototype.getWeekInfo`, que no está en todos los motores; y la
   * app es `es-*`, donde la semana empieza en lunes en los dos casos. Si algún
   * día entra un locale de semana en domingo, este es el sitio.
   *
   * El 1 de enero de 2024 fue lunes. Se usa una fecha fija y no "el lunes de
   * esta semana" para que las cabeceras no dependan de qué día se abra la app.
   */
  protected readonly weekdays = computed<Weekday[]>(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index);
      return {
        narrow: date.toLocaleDateString(this.locale, { weekday: 'narrow' }),
        long: date.toLocaleDateString(this.locale, { weekday: 'long' })
      };
    });
  });

  /**
   * Seis semanas **siempre**, aunque el mes quepa en cinco.
   *
   * Un número variable de filas cambia la altura del popover al pasar de mes, y
   * con ella la posición de los atajos y del pie: el usuario pulsa "Este mes" y
   * el botón se ha movido bajo el cursor. Una fila de más en blanco cuesta
   * mucho menos que eso.
   */
  protected readonly weeks = computed<DayCell[][]>(() => {
    const month = this.visibleMonth();
    const first = startOfMonth(month);

    // `getDay()` cuenta desde el domingo; `+ 6) % 7` lo recoloca desde el lunes.
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const todayIso = toIsoDate(new Date());

    return Array.from({ length: 6 }, (_, week) =>
      Array.from({ length: 7 }, (_, day) => {
        const date = addDays(start, week * 7 + day);
        const iso = toIsoDate(date);
        return {
          iso,
          day: date.getDate(),
          outside: date.getMonth() !== month.getMonth(),
          isToday: iso === todayIso,
          label: date.toLocaleDateString(this.locale, {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
        };
      })
    );
  });

  constructor() {
    // Cerrar al pulsar fuera. Uso legítimo de `effect`: sincroniza un signal
    // con una API imperativa externa —un listener del documento—, igual que
    // `ThemeService` escribiendo `data-theme`. No propaga estado entre signals.
    //
    // El listener solo existe mientras el popover está abierto, y `onCleanup`
    // lo retira tanto al cerrar como al destruir el componente. En fase de
    // captura (`true`) para enterarse aunque algo de dentro pare la
    // propagación.
    //
    // `pointerdown` dispara una vez por clic, así que no hace falta sacarlo de
    // la zona con `runOutsideAngular`: eso hace falta en `scroll`, que dispara
    // decenas de veces por segundo.
    effect(onCleanup => {
      if (!this.open()) {
        return;
      }

      const onPointerDown = (event: Event) => {
        if (!this.host.nativeElement.contains(event.target as Node)) {
          this.close({ returnFocus: false });
        }
      };

      document.addEventListener('pointerdown', onPointerDown, true);
      onCleanup(() => document.removeEventListener('pointerdown', onPointerDown, true));
    });

    // Mover el foco del DOM al día enfocado. `afterRenderEffect` y no `effect`
    // porque hay que TOCAR el DOM y el elemento tiene que existir ya: al cruzar
    // un mes con las flechas, la casilla de destino se pinta en este mismo
    // ciclo, y un `effect` correría antes y no encontraría nada que enfocar.
    afterRenderEffect(() => {
      // Dependencias explícitas: abrir el popover y mover el día son los dos
      // momentos en que el foco tiene que viajar.
      const iso = this.focusedIso();
      this.open();

      if (!this.shouldFocusDay) {
        return;
      }
      this.shouldFocusDay = false;

      this.host.nativeElement.querySelector<HTMLElement>(`[data-iso="${iso}"]`)?.focus();
    });
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }

    // Al abrir se parte del rango aplicado: el calendario muestra el mes del
    // inicio y el foco cae sobre él, no sobre hoy. Abrir en el mes en curso
    // cuando el rango aplicado es de marzo obligaría a navegar hasta allí para
    // ver qué hay seleccionado.
    //
    // Sin rango aplicado no hay de dónde partir, y ahí sí es hoy: es el único
    // punto de referencia que la pantalla y el usuario comparten.
    const range = this.range();
    const start = range ? parseIsoDate(range.from) : new Date();
    this.visibleMonth.set(startOfMonth(start));
    this.focusedIso.set(range ? range.from : toIsoDate(start));
    this.anchor.set(null);
    this.hovered.set(null);
    this.shouldFocusDay = true;
    this.open.set(true);
  }

  /**
   * `returnFocus` distingue quién cerró.
   *
   * Con Escape el foco tiene que volver al botón, o quien navega con teclado se
   * queda sin punto de partida en mitad del documento. Con un clic fuera no:
   * el usuario ya está señalando otra cosa, y devolverle el foco al botón le
   * cancelaría lo que estaba pulsando.
   */
  protected close(options: { returnFocus?: boolean } = {}): void {
    if (!this.open()) {
      return;
    }

    this.open.set(false);
    this.anchor.set(null);
    this.hovered.set(null);

    if (options.returnFocus !== false) {
      this.trigger().nativeElement.focus();
    }
  }

  protected onEscape(event: Event): void {
    if (!this.open()) {
      return;
    }
    // Solo se para la propagación si de verdad había algo que cerrar: si no,
    // este Escape es de otro (un diálogo por encima) y no nos corresponde.
    event.stopPropagation();
    this.close();
  }

  /**
   * Cerrar al salir con el tabulador. El clic fuera ya lo cubre el listener de
   * `pointerdown`; esto es su equivalente por teclado.
   *
   * `relatedTarget` a `null` significa que el foco se fue a la nada (la ventana
   * perdió el foco, por ejemplo). Cerrar ahí sería cerrar el popover cada vez
   * que el usuario cambia de pestaña y vuelve.
   */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.host.nativeElement.contains(next)) {
      this.close({ returnFocus: false });
    }
  }

  /**
   * Quitar el filtro cierra el popover igual que aplicarlo: las dos son
   * decisiones completas sobre qué periodo se consulta, y dejar el calendario
   * abierto después sugeriría que falta un paso.
   */
  protected onClear(): void {
    this.clear.emit();
    this.close();
  }

  protected applyPreset(preset: DateRangePreset): void {
    this.rangeChange.emit(preset.range());
    this.close();
  }

  protected shiftMonth(months: number): void {
    this.visibleMonth.update(current => addMonths(current, months));
  }

  /**
   * El primer clic ancla; el segundo cierra el rango, lo emite y cierra el
   * popover.
   *
   * **No hay botón de "Aplicar"**: con los dos extremos puestos el rango ya no
   * es ambiguo, y pedir un tercer clic para confirmar lo evidente convierte
   * cada cambio de periodo en tres pulsaciones. Descartar sigue existiendo —
   * es Escape, o pulsar fuera, que dejan el rango anterior sin tocar.
   *
   * Si el segundo clic cae **antes** que el ancla, `orderedRange` los
   * intercambia en vez de reiniciar la selección. Reiniciar castiga un error de
   * orden que el usuario no tiene por qué anticipar; intercambiar da el rango
   * entre las dos fechas que ha señalado, que es lo que quería decir.
   */
  protected selectDay(cell: DayCell): void {
    const anchor = this.anchor();

    if (anchor === null) {
      this.anchor.set(cell.iso);
      this.focusedIso.set(cell.iso);
      return;
    }

    this.anchor.set(null);
    this.rangeChange.emit(orderedRange(anchor, cell.iso));
    this.close();
  }

  protected onDayEnter(cell: DayCell): void {
    this.hovered.set(cell.iso);
  }

  protected onGridLeave(): void {
    this.hovered.set(null);
  }

  /**
   * Navegación por la rejilla. Es lo que hace que el calendario sea usable sin
   * ratón, y no sale gratis con botones sueltos: sin esto Tab recorrería las 42
   * casillas una a una.
   *
   * `preventDefault` solo en las teclas que se manejan — las flechas harían
   * scroll de la página y RePág/AvPág saltarían la vista entera.
   */
  protected onGridKeydown(event: KeyboardEvent): void {
    const current = parseIsoDate(this.focusedIso());
    // Días transcurridos de la semana, con el lunes como día 0.
    const weekday = (current.getDay() + 6) % 7;

    let next: Date;
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(current, -1);
        break;
      case 'ArrowRight':
        next = addDays(current, 1);
        break;
      case 'ArrowUp':
        next = addDays(current, -7);
        break;
      case 'ArrowDown':
        next = addDays(current, 7);
        break;
      case 'Home':
        next = addDays(current, -weekday);
        break;
      case 'End':
        next = addDays(current, 6 - weekday);
        break;
      // Con Mayús salta de año, que es el atajo que espera quien conoce el
      // patrón de calendario de la guía ARIA.
      case 'PageUp':
        next = addMonths(current, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(current, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    this.moveFocusTo(next);
  }

  private moveFocusTo(date: Date): void {
    const month = this.visibleMonth();
    if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) {
      this.visibleMonth.set(startOfMonth(date));
    }

    this.shouldFocusDay = true;
    this.focusedIso.set(toIsoDate(date));
  }

  protected isStart(iso: string): boolean {
    return iso === this.preview()?.from;
  }

  protected isEnd(iso: string): boolean {
    return iso === this.preview()?.to;
  }

  /** Estrictamente entre los dos extremos: las cadenas ISO se ordenan solas. */
  protected isBetween(iso: string): boolean {
    const preview = this.preview();
    return preview !== null && iso > preview.from && iso < preview.to;
  }

  protected isSelected(iso: string): boolean {
    return this.isStart(iso) || this.isEnd(iso) || this.isBetween(iso);
  }
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Sumar meses conservando el día **sin desbordar**.
 *
 * `new Date(2026, 0, 31)` más un mes con aritmética ingenua da el 31 de
 * febrero, que el `Date` normaliza al 3 de marzo: pulsar "mes siguiente" desde
 * el 31 de enero se saltaría febrero entero. Recortar al último día del mes
 * destino es lo que espera cualquiera que use un calendario.
 */
function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const day = Math.min(date.getDate(), lastDayOfMonth(target.getFullYear(), target.getMonth()));
  return new Date(target.getFullYear(), target.getMonth(), day);
}
