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
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
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
import { monthBounds, weekBounds } from '../../../calendar/calendar-date';
import { EventFilter, EventResponse } from '../../../calendar/models/event.model';
import { EventDetail } from '../../../calendar/components/event-detail/event-detail';
import { EventEdit } from '../../../calendar/components/event-edit/event-edit';
import { TaskService } from '../../../tasks/task.service';
import { TaskFilter, TaskResponse } from '../../../tasks/models/task.model';
import { TransactionService } from '../../../finance/transaction.service';
import { TransactionFilter, TransactionResponse } from '../../../finance/models/transaction.model';
import {
  AGENDA_KIND_LABELS_SINGULAR,
  AgendaGroup,
  AgendaItem,
  groupAgendaByDay,
  groupItemsByKind,
  monthDateBounds,
  weekDateBounds
} from './agenda';

/** Qué se ve encima de la cuadrícula: cerrado, día expandido, detalle o edición — unión cerrada, no signals sueltos. */
type WidgetMode =
  | { kind: 'closed' }
  | { kind: 'edit'; event: EventResponse | null }
  | { kind: 'detail'; eventId: string }
  | { kind: 'day'; iso: string };

const MAX_VISIBLE_PER_DAY = 3;

/** Cubre un mes completo en una sola petición sin depender de paginar por `totalElements`. Mismo tope para las tres fuentes. */
const MONTH_PAGE_SIZE = 150;

/** Una semana no llega ni de lejos a esto; generoso a propósito, mismo criterio que `MONTH_PAGE_SIZE`. */
const WEEK_PAGE_SIZE = 50;

/** Desplazamiento horizontal mínimo (px) para que un gesto cuente como swipe y no como scroll vertical. */
const SWIPE_THRESHOLD_PX = 40;

interface DayCell {
  readonly iso: string;
  readonly day: number;
  readonly outside: boolean;
  readonly isToday: boolean;
  /** Sin recortar — cada consumidor decide su propio tope (la cuadrícula 3, el carrusel 8). */
  readonly items: readonly AgendaItem[];
  readonly totalCount: number;
}

/** Ver `peekDays()`: `card` es `null` cuando la semana del vecino no está cargada todavía. */
interface PeekDay {
  readonly iso: string;
  readonly day: number;
  readonly label: string;
  readonly card: DayCell | null;
}

/**
 * Widget de Calendario en Home — fusiona eventos, tareas con vencimiento y transacciones en una sola agenda (fusión en `agenda.ts`).
 * Importa de `calendar/`, `tasks/` y `finance/`: excepción direccional de Home (`home -> feature`), igual que `assistant-widget`.
 * Escritorio: cuadrícula de mes con chips. Móvil: carrusel de un día activo con vecinos en vista previa, sin tope de semana.
 * El carrusel carga su propia semana (`weekAgenda`), aparte del mes visible (`monthAgenda`) — una semana a caballo de dos meses
 * se quedaría con días sin datos si reutilizara la del mes. El panel de un día es compartido: "+N más" en escritorio, la
 * tarjeta del carrusel en móvil — mismo `mode: {kind:'day'}`, fuente según `breakpoint.isDesktop()`.
 * Tocar un evento abre `EventDetail` (self-fetch); tocar tarea o transacción navega a `/tasks/:id`/`/finance/:id` — no duplica sus formularios.
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
  private readonly tasks = inject(TaskService);
  private readonly transactions = inject(TransactionService);
  private readonly router = inject(Router);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly breakpoint = inject(BreakpointService);

  // --- Estado -----------------------------------------------------------------

  private readonly visibleMonth = signal(startOfMonth(new Date()));
  private readonly monthAgenda = signal<Map<string, AgendaItem[]>>(new Map());

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly mode = signal<WidgetMode>({ kind: 'closed' });

  /** El día central del carrusel móvil. Independiente de `visibleMonth` — ver el comentario de la clase. */
  protected readonly activeDay = signal(toIsoDate(new Date()));

  private readonly weekAgenda = signal<Map<string, AgendaItem[]>>(new Map());
  protected readonly weekLoading = signal(true);
  protected readonly weekErrorMessage = signal<string | null>(null);

  private pointerId: number | null = null;
  private swipeStartX = 0;
  private swipeStartY = 0;

  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panel');

  /** Pide llevar el panel a la vista en el próximo render; la consume y apaga un `afterRenderEffect`, no un signal. */
  private shouldScrollToPanel = false;

  // --- Derivados: cuadrícula de mes y carrusel ---------------------------------

  protected readonly monthLabel = computed(() => capitalize(this.locale, this.visibleMonth().toLocaleDateString(this.locale, { month: 'long', year: 'numeric' })));

  /** Lo que recibe `<app-date-range-picker>`. Solo se usa `range.from` al cambiar — un grid de mes no pinta un rango parcial. */
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

  /** Seis semanas siempre, mismo motivo que `DateRangePicker`: un número variable movería el resto de la tarjeta al cambiar de mes. */
  protected readonly weeks = computed<DayCell[][]>(() => {
    const month = this.visibleMonth();
    const first = startOfMonth(month);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const todayIso = toIsoDate(new Date());
    const byDay = this.monthAgenda();

    return Array.from({ length: 6 }, (_, week) =>
      Array.from({ length: 7 }, (_, day) => buildDayCell(addDays(start, week * 7 + day), month, todayIso, byDay))
    );
  });

  /** Los 7 días (lunes-domingo) de la semana de `activeDay`, para el carrusel. `outside` aquí es "de otro mes que el activo", no fuera de rango. */
  protected readonly weekDays = computed<DayCell[]>(() => {
    const active = parseIsoDate(this.activeDay());
    const monday = this.mondayOf(active);
    const todayIso = toIsoDate(new Date());
    const byDay = this.weekAgenda();

    return Array.from({ length: 7 }, (_, day) => buildDayCell(addDays(monday, day), active, todayIso, byDay));
  });

  protected readonly activeCard = computed<DayCell | null>(
    () => this.weekDays().find(cell => cell.iso === this.activeDay()) ?? null
  );

  /** Vista previa de ayer/mañana. `card` es `null` cuando el vecino cae en la semana de al lado, todavía sin cargar. */
  protected readonly peekDays = computed(() => ({
    prev: this.buildPeekDay(addDays(parseIsoDate(this.activeDay()), -1)),
    next: this.buildPeekDay(addDays(parseIsoDate(this.activeDay()), 1))
  }));

  private buildPeekDay(date: Date): PeekDay {
    const iso = toIsoDate(date);
    return {
      iso,
      day: date.getDate(),
      label: this.formatCompactLabel(date),
      card: this.weekDays().find(cell => cell.iso === iso) ?? null
    };
  }

  /** "Semana del 12 al 18" — o "...18 sep al 2 oct" si la semana cruza de mes. */
  protected readonly weekBadgeLabel = computed(() => {
    const days = this.weekDays();
    const from = parseIsoDate(days[0].iso);
    const to = parseIsoDate(days[6].iso);

    if (from.getMonth() === to.getMonth()) {
      return `Semana del ${from.getDate()} al ${to.getDate()}`;
    }

    const fromMonth = from.toLocaleDateString(this.locale, { month: 'short' });
    const toMonth = to.toLocaleDateString(this.locale, { month: 'short' });
    return `Semana del ${from.getDate()} ${fromMonth} al ${to.getDate()} ${toMonth}`;
  });

  /** "Jueves, Octubre" — sin el día, que ya está grande al lado (tarjeta activa y vistas previas). */
  protected readonly activeDayHeading = computed(() => this.formatCompactLabel(parseIsoDate(this.activeDay())));

  // --- Derivados: diálogos y panel de agenda -----------------------------------

  // Las cuatro ramas de `WidgetMode` como computed planos, no `@if` en la plantilla — mismo criterio que `task-detail`.
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

  /** Fuente según el ancho: "+N más" en escritorio, la tarjeta del carrusel en móvil — mismo `mode: {kind:'day'}`. */
  protected readonly dayAgendaItems = computed<AgendaItem[]>(() => {
    const iso = this.dayIso();
    if (!iso) {
      return [];
    }
    const byDay = this.breakpoint.isDesktop() ? this.monthAgenda() : this.weekAgenda();
    return byDay.get(iso) ?? [];
  });

  /** Solo para el carrusel móvil: los mismos ítems de `dayAgendaItems()`, repartidos por dominio — el panel de escritorio sigue en lista plana. */
  protected readonly dayAgendaGroups = computed<AgendaGroup[]>(() => groupItemsByKind(this.dayAgendaItems()));

  protected readonly dayLabel = computed(() => {
    const iso = this.dayIso();
    return iso ? this.formatDayHeading(iso) : '';
  });

  /** El disparador "Toca para desplegar/contraer agenda" del carrusel. */
  protected readonly dayPanelExpanded = computed(() => this.dayIso() === this.activeDay());

  // --- Carga --------------------------------------------------------------------

  constructor() {
    // `afterRenderEffect`, no `effect`: hay que LEER si `#panel` ya existe, y solo lo hace pintado.
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
    this.loadWeek();

    // El agente puede tocar eventos/tareas/transacciones con el chat abierto; se refrescan las dos fuentes por si cruzó el breakpoint.
    this.dataRefresh.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.load();
      this.loadWeek();
    });
  }

  /** Tres peticiones en paralelo, no un `forkJoin` que aborta entero: cada `fetchX` atrapa su propio error y degrada a `[]`. */
  private load(): void {
    this.errorMessage.set(null);

    const { from, to } = monthBounds(this.visibleMonth());
    const { from: dueFrom, to: dueTo } = monthDateBounds(this.visibleMonth());

    forkJoin({
      events: this.fetchEvents({ from, to }),
      tasks: this.fetchTasks({ dueFrom, dueTo }),
      transactions: this.fetchTransactions({ from: dueFrom, to: dueTo })
    }).subscribe(({ events, tasks, transactions }) => {
      this.monthAgenda.set(groupAgendaByDay(events, tasks, transactions));
      this.loading.set(false);
    });
  }

  /** Alcance de semana para el carrusel móvil — ver el comentario de la clase. */
  private loadWeek(): void {
    this.weekErrorMessage.set(null);

    const monday = this.mondayOf(parseIsoDate(this.activeDay()));
    const { from, to } = weekBounds(monday);
    const { from: dueFrom, to: dueTo } = weekDateBounds(monday);

    forkJoin({
      events: this.fetchEvents({ from, to }, WEEK_PAGE_SIZE),
      tasks: this.fetchTasks({ dueFrom, dueTo }, WEEK_PAGE_SIZE),
      transactions: this.fetchTransactions({ from: dueFrom, to: dueTo }, WEEK_PAGE_SIZE)
    }).subscribe(({ events, tasks, transactions }) => {
      this.weekAgenda.set(groupAgendaByDay(events, tasks, transactions));
      this.weekLoading.set(false);
    });
  }

  private fetchEvents(filter: EventFilter, size = MONTH_PAGE_SIZE): Observable<EventResponse[]> {
    return this.calendar.list(filter, { size }).pipe(
      map(page => page.content),
      catchError((err: HttpErrorResponse) => {
        this.errorMessage.set(extractErrorMessage(err));
        return of([]);
      })
    );
  }

  /** Sin `status`: `TaskFilter.status` solo admite un valor y hacen falta dos (`PENDING`/`IN_PROGRESS`); se filtra en `groupAgendaByDay`. */
  private fetchTasks(filter: Omit<TaskFilter, 'status'>, size = MONTH_PAGE_SIZE): Observable<TaskResponse[]> {
    return this.tasks.list(filter, { size }).pipe(
      map(page => page.content),
      catchError((err: HttpErrorResponse) => {
        this.errorMessage.set(extractErrorMessage(err));
        return of([]);
      })
    );
  }

  private fetchTransactions(filter: TransactionFilter, size = MONTH_PAGE_SIZE): Observable<TransactionResponse[]> {
    return this.transactions.list(filter, { size }).pipe(
      map(page => page.content),
      catchError((err: HttpErrorResponse) => {
        this.errorMessage.set(extractErrorMessage(err));
        return of([]);
      })
    );
  }

  /** Lunes de la semana que contiene `date`. Compartido por `weekDays()` y `loadWeek()`. */
  private mondayOf(date: Date): Date {
    return addDays(date, -((date.getDay() + 6) % 7));
  }

  // --- Navegación de mes (escritorio) --------------------------------------------

  protected shiftMonth(delta: number): void {
    this.visibleMonth.update(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
    this.load();
  }

  protected onRangeChange(range: DateRange): void {
    const start = parseIsoDate(range.from);
    this.visibleMonth.set(new Date(start.getFullYear(), start.getMonth(), 1));
    this.load();
  }

  /** Evento → abre `EventDetail`; tarea/transacción → navegan. Un solo disparador para chips y filas de agenda. */
  protected onItemClick(item: AgendaItem): void {
    switch (item.kind) {
      case 'event':
        this.mode.set({ kind: 'detail', eventId: item.id });
        return;
      case 'task':
        this.router.navigate(['/tasks', item.id]);
        return;
      case 'transaction':
        this.router.navigate(['/finance', item.id]);
        return;
    }
  }

  protected onMoreClick(iso: string): void {
    this.mode.set({ kind: 'day', iso });
    this.shouldScrollToPanel = true;
  }

  // --- Carrusel semanal (móvil) ----------------------------------------------

  /** De qué lado entra la tarjeta activa en la animación: `1` derecha, `-1` izquierda. Consumida por `[style.--cw-slide-from]`. */
  protected readonly slideDirection = signal<1 | -1>(1);

  /** Mueve el día activo ±1, sin tope de semana ni de mes. */
  protected shiftActiveDay(delta: number): void {
    this.setActiveDay(toIsoDate(addDays(parseIsoDate(this.activeDay()), delta)), delta > 0 ? 1 : -1);
  }

  /** `direction` opcional: si falta (punto de paginación, vecino tocado) se deduce comparando ISO como cadenas. */
  protected setActiveDay(iso: string, direction?: 1 | -1): void {
    const previousWeekStart = this.weekDays()[0]?.iso;
    this.slideDirection.set(direction ?? (iso < this.activeDay() ? -1 : 1));
    this.activeDay.set(iso);

    if (this.weekDays()[0]?.iso !== previousWeekStart) {
      this.loadWeek();
    }

    // Si el panel de agenda estaba abierto, sigue al nuevo día activo.
    if (this.mode().kind === 'day') {
      this.mode.set({ kind: 'day', iso });
    }
  }

  /** Toggle de la tarjeta activa para desplegar/contraer la agenda del día. */
  protected toggleDayPanel(): void {
    if (this.dayPanelExpanded()) {
      this.mode.set({ kind: 'closed' });
      return;
    }
    this.mode.set({ kind: 'day', iso: this.activeDay() });
  }

  protected onCarouselPointerDown(event: PointerEvent): void {
    this.pointerId = event.pointerId;
    this.swipeStartX = event.clientX;
    this.swipeStartY = event.clientY;
  }

  /** Swipe simple: compara la posición de bajada y subida, sin seguir al dedo — no hace falta `setPointerCapture` aquí. */
  protected onCarouselPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.pointerId = null;

    const dx = event.clientX - this.swipeStartX;
    const dy = event.clientY - this.swipeStartY;

    // Un gesto predominantemente vertical es scroll de la página, no swipe.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) {
      return;
    }

    this.shiftActiveDay(dx < 0 ? 1 : -1);
  }

  protected onCarouselPointerCancel(event: PointerEvent): void {
    if (event.pointerId === this.pointerId) {
      this.pointerId = null;
    }
  }

  // --- Diálogos de evento (los dos anchos) ---------------------------------------

  protected onEventEdit(event: EventResponse): void {
    this.mode.set({ kind: 'edit', event });
  }

  /** Alta, edición y borrado cierran siempre al panel base y refrescan las tres fuentes — no vuelven a la lista intermedia. */
  protected onEventDeleted(): void {
    this.mode.set({ kind: 'closed' });
    this.load();
    this.loadWeek();
  }

  protected onEventSaved(): void {
    this.mode.set({ kind: 'closed' });
    this.load();
    this.loadWeek();
  }

  protected onPanelClose(): void {
    this.mode.set({ kind: 'closed' });
  }

  /** Solo la cuadrícula de escritorio: `cell.items` no viene recortado, cada consumidor recorta a su propio tope. */
  protected visibleChips(cell: DayCell): readonly AgendaItem[] {
    return cell.items.slice(0, MAX_VISIBLE_PER_DAY);
  }

  protected moreCount(cell: DayCell): number {
    return Math.max(0, cell.totalCount - MAX_VISIBLE_PER_DAY);
  }

  /** Hasta 8 puntos reales (no rotación decorativa) — tarjeta activa y vistas previas comparten este tope. */
  protected dotItems(cell: DayCell): readonly AgendaItem[] {
    return cell.items.slice(0, 8);
  }

  /** Equivalente accesible del color de cada fila (`.cw__day-event--{{ item.tone }}`); en escritorio es la única pista de dominio. */
  protected itemKindLabel(item: AgendaItem): string {
    return AGENDA_KIND_LABELS_SINGULAR[item.kind];
  }

  /** "Jueves, 15 de octubre" — título del panel de agenda, que no va pegado a ningún número grande. */
  private formatDayHeading(iso: string): string {
    return capitalize(
      this.locale,
      parseIsoDate(iso).toLocaleDateString(this.locale, { weekday: 'long', day: 'numeric', month: 'long' })
    );
  }

  /** "Jueves, Octubre" — dos llamadas por separado porque `toLocaleDateString` no deja fijar el orden al pedir weekday+month juntos. */
  private formatCompactLabel(date: Date): string {
    const weekday = date.toLocaleDateString(this.locale, { weekday: 'long' });
    const month = date.toLocaleDateString(this.locale, { month: 'long' });
    return capitalize(this.locale, `${weekday}, ${month}`);
  }
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** `Intl` devuelve meses y días en minúscula en español; encabezan un `h2`/botón. */
function capitalize(locale: string, text: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Compartida por `weeks()` y `weekDays()`: las dos son "7 días a partir de un lunes", solo cambia el lunes y qué cuenta como `outside`. */
function buildDayCell(
  date: Date,
  monthReference: Date,
  todayIso: string,
  byDay: Map<string, AgendaItem[]>
): DayCell {
  const iso = toIsoDate(date);
  const items = byDay.get(iso) ?? [];

  return {
    iso,
    day: date.getDate(),
    outside: date.getMonth() !== monthReference.getMonth(),
    isToday: iso === todayIso,
    items,
    totalCount: items.length
  };
}
