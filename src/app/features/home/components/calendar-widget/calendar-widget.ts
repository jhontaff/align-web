import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  OnInit,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataRefreshService } from '../../../../core/data/data-refresh.service';
import { prefersReducedMotion } from '../../../../core/dom/prefers-reduced-motion';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { BreakpointService } from '../../../../core/layout/breakpoint.service';
import {
  DateRange,
  addDays,
  lastDayOfMonth,
  parseIsoDate,
  toIsoDate,
  weekdayLabels
} from '../../../../core/date/date-range';
import { Icon } from '../../../../shared/ui/icon/icon';
import { DateRangePicker } from '../../../../shared/ui/date-range-picker/date-range-picker';
import { CalendarService } from '../../../calendar/calendar.service';
import { monthBounds, splitLocalDateTime } from '../../../calendar/calendar-date';
import { EventResponse } from '../../../calendar/models/event.model';
import { EventDetail } from '../../../calendar/components/event-detail/event-detail';
import { EventEdit } from '../../../calendar/components/event-edit/event-edit';

/**
 * Qué se ve encima de la cuadrícula: nada (la cuadrícula misma), la lista de
 * un día (desbordamiento en escritorio, único camino en móvil), el detalle
 * de un evento, o el formulario de alta/edición.
 *
 * Unión cerrada y no cuatro signals sueltos — mismo motivo que `DetailState`
 * en `task-detail`: con signals independientes hay combinaciones imposibles
 * que alguien tendría que prohibir a mano.
 */
type WidgetMode =
  | { kind: 'closed' }
  | { kind: 'edit'; event: EventResponse | null }
  | { kind: 'detail'; eventId: string }
  | { kind: 'day'; iso: string };

type Tone = 'primary' | 'success' | 'warning';

/** Orden fijo: 1º evento del día, 2º y 3º. Sin `danger` — se descartó reservarlo para conflictos de horario. */
const TONES: readonly Tone[] = ['primary', 'success', 'warning'];

const MAX_VISIBLE_PER_DAY = 3;

/** Cubre un mes completo en una sola petición sin depender de paginar por `totalElements`. */
const MONTH_PAGE_SIZE = 150;

interface DayEvent {
  readonly event: EventResponse;
  readonly tone: Tone;
}

interface DayCell {
  readonly iso: string;
  readonly day: number;
  readonly outside: boolean;
  readonly isToday: boolean;
  readonly events: readonly DayEvent[];
  readonly moreCount: number;
  readonly totalCount: number;
}

/**
 * Widget de Calendario en Home. Calendar no tiene ruta ni pestaña propia —
 * todo se consume desde aquí, incluida la creación y edición de eventos.
 *
 * Importa componentes de `features/calendar/` (`EventDetail`, `EventEdit`):
 * es la excepción direccional de Home, la misma que ya usa `assistant-widget`
 * componiendo `chat-thread`/`chat-composer` — la flecha va siempre
 * `home -> feature`, nunca al revés, y `calendar/` no sabe que Home existe.
 *
 * Escritorio (`BreakpointService.isDesktop`) pinta hasta 3 eventos por día
 * como tarjetas con su título; móvil pinta los mismos tres como puntos y el
 * clic en el día abre siempre su lista completa, nunca salta directo al
 * detalle — es la única diferencia de comportamiento entre los dos anchos,
 * el resto (colores, tope de 3, el 4º puesto como "ver más") es igual.
 */
@Component({
  selector: 'app-calendar-widget',
  imports: [Icon, DateRangePicker, EventDetail, EventEdit],
  templateUrl: './calendar-widget.html',
  styleUrl: './calendar-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarWidget implements OnInit {
  private readonly calendar = inject(CalendarService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly breakpoint = inject(BreakpointService);

  private readonly visibleMonth = signal(startOfMonth(new Date()));
  private readonly events = signal<EventResponse[]>([]);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly mode = signal<WidgetMode>({ kind: 'closed' });

  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panel');

  /**
   * Pide llevar el panel a la vista en el próximo render. Bandera plana, no
   * signal, a propósito — mismo criterio que `shouldFocusDay` en
   * `DateRangePicker`: la consume y la apaga un `afterRenderEffect`, y
   * escribir un signal desde un efecto es justo lo que las convenciones del
   * repo prohíben.
   */
  private shouldScrollToPanel = false;

  protected readonly monthLabel = computed(() => capitalize(this.locale, this.visibleMonth().toLocaleDateString(this.locale, { month: 'long', year: 'numeric' })));

  /**
   * Lo que le pasa a `<app-date-range-picker>`. Solo se usa `range.from` al
   * recibir un cambio (`onRangeChange`) — un grid de mes no tiene dónde
   * pintar un rango parcial, así que el resto del rango se descarta a
   * propósito.
   */
  protected readonly pickerRange = computed<DateRange>(() => {
    const month = this.visibleMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    return {
      from: toIsoDate(month),
      to: toIsoDate(new Date(year, monthIndex, lastDayOfMonth(year, monthIndex)))
    };
  });

  protected readonly weekdays = computed(() => weekdayLabels(this.locale));

  private readonly eventsByDay = computed(() => {
    const map = new Map<string, EventResponse[]>();
    for (const event of this.events()) {
      const day = splitLocalDateTime(event.startAt).date;
      const list = map.get(day);
      if (list) {
        list.push(event);
      } else {
        map.set(day, [event]);
      }
    }
    return map;
  });

  /** Seis semanas siempre, mismo motivo que `DateRangePicker`: un número variable movería el resto de la tarjeta al cambiar de mes. */
  protected readonly weeks = computed<DayCell[][]>(() => {
    const month = this.visibleMonth();
    const first = startOfMonth(month);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const todayIso = toIsoDate(new Date());
    const byDay = this.eventsByDay();

    return Array.from({ length: 6 }, (_, week) =>
      Array.from({ length: 7 }, (_, day) => {
        const date = addDays(start, week * 7 + day);
        const iso = toIsoDate(date);
        const dayEvents = byDay.get(iso) ?? [];

        return {
          iso,
          day: date.getDate(),
          outside: date.getMonth() !== month.getMonth(),
          isToday: iso === todayIso,
          events: dayEvents.slice(0, MAX_VISIBLE_PER_DAY).map((event, index) => ({ event, tone: TONES[index] })),
          moreCount: Math.max(0, dayEvents.length - MAX_VISIBLE_PER_DAY),
          totalCount: dayEvents.length
        };
      })
    );
  });

  // Las cuatro ramas de `WidgetMode` se abren aquí, no en la plantilla: tres
  // (aquí cuatro) computed planos evitan depender del estrechamiento de tipos
  // dentro de `@if` — mismo criterio que `task-detail`/`habit-detail`.
  protected readonly editing = computed(() => this.mode().kind === 'edit');

  protected readonly editEvent = computed<EventResponse | null>(() => {
    const mode = this.mode();
    return mode.kind === 'edit' ? mode.event : null;
  });

  protected readonly detailEventId = computed<string | null>(() => {
    const mode = this.mode();
    return mode.kind === 'detail' ? mode.eventId : null;
  });

  protected readonly dayIso = computed<string | null>(() => {
    const mode = this.mode();
    return mode.kind === 'day' ? mode.iso : null;
  });

  protected readonly dayEvents = computed<EventResponse[]>(() => {
    const iso = this.dayIso();
    return iso ? (this.eventsByDay().get(iso) ?? []) : [];
  });

  protected readonly dayLabel = computed(() => {
    const iso = this.dayIso();
    if (!iso) {
      return '';
    }
    return capitalize(
      this.locale,
      parseIsoDate(iso).toLocaleDateString(this.locale, { weekday: 'long', day: 'numeric', month: 'long' })
    );
  });

  constructor() {
    // `afterRenderEffect` y no `effect`: hay que LEER si `#panel` ya existe
    // en el DOM, y solo lo hace una vez pintado — un `effect` correría antes
    // y no encontraría nada a lo que hacer scroll. Mismo patrón que el
    // desplazamiento automático de `chat-thread` y el foco de día de
    // `DateRangePicker`.
    afterRenderEffect(() => {
      const el = this.panelEl()?.nativeElement;
      if (!el || !this.shouldScrollToPanel) {
        return;
      }
      this.shouldScrollToPanel = false;

      el.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'nearest'
      });
    });
  }

  ngOnInit(): void {
    this.load();

    // El agente puede crear, mover o borrar eventos mientras Inicio está
    // detrás del panel de chat — mismo motivo que `TasksSummary`.
    this.dataRefresh.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  /**
   * Siempre con `from`/`to` explícitos: sin ellos el backend devuelve TODO
   * el historial del usuario, no el mes visible (verificado en
   * `EventServiceImpl.list` — no hay default de "mes en curso" como sí tiene
   * el resumen de Finanzas).
   */
  private load(): void {
    this.errorMessage.set(null);

    const { from, to } = monthBounds(this.visibleMonth());
    this.calendar.list({ from, to }, { size: MONTH_PAGE_SIZE }).subscribe({
      next: page => {
        this.events.set(page.content);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  protected shiftMonth(delta: number): void {
    this.visibleMonth.update(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
    this.load();
  }

  protected onRangeChange(range: DateRange): void {
    const start = parseIsoDate(range.from);
    this.visibleMonth.set(new Date(start.getFullYear(), start.getMonth(), 1));
    this.load();
  }

  // `shouldScrollToPanel` solo se marca al abrir la lista de un día — sigue
  // siendo el panel que se despliega debajo del grid. Detalle y edición son
  // cuadros flotantes propios (ver `event-detail`/`event-edit`): se
  // centran solos en la pantalla, no hay nada de la página que desplazar.

  protected onCreateClick(): void {
    this.mode.set({ kind: 'edit', event: null });
  }

  protected onChipClick(event: EventResponse): void {
    this.mode.set({ kind: 'detail', eventId: event.id });
  }

  protected onMoreClick(iso: string): void {
    this.mode.set({ kind: 'day', iso });
    this.shouldScrollToPanel = true;
  }

  /** Móvil: el clic en el día SIEMPRE abre su lista completa, nunca salta directo al detalle. */
  protected onDayClick(cell: DayCell): void {
    if (cell.totalCount > 0) {
      this.mode.set({ kind: 'day', iso: cell.iso });
      this.shouldScrollToPanel = true;
    }
  }

  protected onDayEventClick(eventId: string): void {
    this.mode.set({ kind: 'detail', eventId });
  }

  protected onEventEdit(event: EventResponse): void {
    this.mode.set({ kind: 'edit', event });
  }

  /**
   * Alta, edición y borrado cierran siempre al panel base y refrescan la
   * cuadrícula — no vuelven a la lista del día intermedia aunque se haya
   * llegado desde ahí. Simplificación deliberada: recordar "de dónde venía"
   * es estado de más para un beneficio pequeño.
   */
  protected onEventDeleted(): void {
    this.mode.set({ kind: 'closed' });
    this.load();
  }

  protected onEventSaved(): void {
    this.mode.set({ kind: 'closed' });
    this.load();
  }

  protected onPanelClose(): void {
    this.mode.set({ kind: 'closed' });
  }

  protected eventTimeLabel(event: EventResponse): string {
    return splitLocalDateTime(event.startAt).time;
  }
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** `Intl` devuelve meses y días en minúscula en español; encabezan un `h2`/botón. */
function capitalize(locale: string, text: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}
