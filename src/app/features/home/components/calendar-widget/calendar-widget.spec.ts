import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { toIsoDate } from '../../../../core/date/date-range';
import { DataRefreshService } from '../../../../core/data/data-refresh.service';
import { BreakpointService } from '../../../../core/layout/breakpoint.service';
import { Page } from '../../../../core/models/page.model';
import { CalendarService } from '../../../calendar/calendar.service';
import { EventFilter, EventResponse } from '../../../calendar/models/event.model';
import { TaskService } from '../../../tasks/task.service';
import { TaskFilter, TaskResponse } from '../../../tasks/models/task.model';
import { TransactionService } from '../../../finance/transaction.service';
import { TransactionFilter, TransactionResponse } from '../../../finance/models/transaction.model';
import { CalendarWidget } from './calendar-widget';

/**
 * Los miembros que estas pruebas leen/llaman (`weeks`, `activeDay`,
 * `onItemClick`...) son `protected`: el widget solo los expone a su propia
 * plantilla. El acceso por corchete (`instancia['miembro']`) es el escape
 * habitual de TypeScript para eso en pruebas — evita depender de montar
 * cadenas completas (p. ej. el `<dialog>` real de `EventDetail`) solo para
 * leer un signal.
 */
type Interno = Record<string, any>;

/** Doble por fuente: registra qué se pidió, devuelve lo que se le programe. Sin cola — `load()`/`loadWeek()` piden dos veces (mes y semana) y casi siempre se quiere la misma respuesta las dos. */
class CalendarServiceDoble {
  readonly peticiones: (EventFilter | undefined)[] = [];
  respuesta: EventResponse[] = [];
  fallar = false;

  list(filter?: EventFilter): Observable<Page<EventResponse>> {
    this.peticiones.push(filter);
    if (this.fallar) {
      return throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Calendario caído' } }));
    }
    return of(pagina(this.respuesta));
  }

  /** `EventDetail` se auto-carga por id en cuanto `mode` pasa a `'detail'` — hace falta aunque la prueba no mire su resultado. */
  get(id: string): Observable<EventResponse> {
    return of(event(id));
  }
}

class TaskServiceDoble {
  readonly peticiones: (TaskFilter | undefined)[] = [];
  respuesta: TaskResponse[] = [];
  fallar = false;

  list(filter?: TaskFilter): Observable<Page<TaskResponse>> {
    this.peticiones.push(filter);
    if (this.fallar) {
      return throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Tareas caídas' } }));
    }
    return of(pagina(this.respuesta));
  }
}

class TransactionServiceDoble {
  readonly peticiones: (TransactionFilter | undefined)[] = [];
  respuesta: TransactionResponse[] = [];
  fallar = false;

  list(filter?: TransactionFilter): Observable<Page<TransactionResponse>> {
    this.peticiones.push(filter);
    if (this.fallar) {
      return throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Transacciones caídas' } }));
    }
    return of(pagina(this.respuesta));
  }
}

function pagina<T>(content: T[]): Page<T> {
  return { content, totalElements: content.length, totalPages: 1, number: 0, size: content.length || 1, first: true, last: true };
}

/** Hoy cae dentro del mes Y de la semana visibles siempre — evita calcular límites de rango a mano en cada prueba. */
function todayIso(): string {
  return toIsoDate(new Date());
}

function todayAt(time: string): string {
  return `${todayIso()}T${time}:00`;
}

function event(id: string, time = '10:00', title = 'Reunión'): EventResponse {
  return {
    id,
    title,
    description: null,
    startAt: todayAt(time),
    endAt: null,
    location: null,
    reminderMinutesBefore: null,
    createdAt: todayAt(time),
    updatedAt: todayAt(time)
  };
}

function task(id: string, status: TaskResponse['status'] = 'PENDING', title = 'Tarea'): TaskResponse {
  return {
    id,
    title,
    description: null,
    status,
    priority: 'MEDIUM',
    dueDate: todayIso(),
    dueTime: null,
    createdAt: todayAt('00:00'),
    updatedAt: todayAt('00:00')
  };
}

function transaction(id: string, type: TransactionResponse['type'] = 'EXPENSE'): TransactionResponse {
  return {
    id,
    type,
    amount: 10,
    category: type === 'INCOME' ? 'SALARY' : 'FOOD',
    description: null,
    date: todayIso(),
    createdAt: todayAt('00:00'),
    updatedAt: todayAt('00:00')
  };
}

describe('CalendarWidget', () => {
  let fixture: ComponentFixture<CalendarWidget>;
  let interno: Interno;
  let host: HTMLElement;
  let calendarDoble: CalendarServiceDoble;
  let tasksDoble: TaskServiceDoble;
  let transactionsDoble: TransactionServiceDoble;

  // Las doubles se crean aquí, no dentro de `montar()`: una prueba necesita
  // programar `.respuesta`/`.fallar` ANTES de montar, y `montar()` solo
  // arranca el widget con lo que ya exista en ellas.
  beforeEach(() => {
    calendarDoble = new CalendarServiceDoble();
    tasksDoble = new TaskServiceDoble();
    transactionsDoble = new TransactionServiceDoble();
  });

  /** `isDesktop` fijo por prueba: `BreakpointService` real depende del ancho de la ventana de Karma, no del que cada prueba necesita. */
  async function montar(isDesktop: boolean): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [CalendarWidget],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'es-CO' },
        { provide: CalendarService, useValue: calendarDoble },
        { provide: TaskService, useValue: tasksDoble },
        { provide: TransactionService, useValue: transactionsDoble },
        { provide: BreakpointService, useValue: { isDesktop: signal(isDesktop) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarWidget);
    interno = fixture.componentInstance as unknown as Interno;
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function estabilizar(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('se crea sin errores en escritorio', async () => {
    await montar(true);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('se crea sin errores en móvil', async () => {
    await montar(false);
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('escritorio — cuadrícula de mes', () => {
    it('funde evento, tarea y transacción del mismo día en la misma celda', async () => {
      calendarDoble.respuesta = [event('e1')];
      tasksDoble.respuesta = [task('t1')];
      transactionsDoble.respuesta = [transaction('x1')];
      await montar(true);

      const hoy = interno['weeks']().flat().find((cell: Interno) => cell['isToday']);
      expect(hoy.totalCount).toBe(3);
      expect(hoy.items.map((i: Interno) => i['kind'])).toEqual(['event', 'task', 'transaction']);
    });

    it('una tarea COMPLETED no llega a pintarse — el widget la descarta de punta a punta, no solo la función pura', async () => {
      tasksDoble.respuesta = [task('t1', 'COMPLETED')];
      await montar(true);

      const hoy = interno['weeks']().flat().find((cell: Interno) => cell['isToday']);
      expect(hoy.totalCount).toBe(0);
    });

    it('si Transacciones falla, Calendario y Tareas se pintan igual — ninguna fuente tira a las otras', async () => {
      calendarDoble.respuesta = [event('e1')];
      tasksDoble.respuesta = [task('t1')];
      transactionsDoble.fallar = true;
      await montar(true);

      const hoy = interno['weeks']().flat().find((cell: Interno) => cell['isToday']);
      expect(hoy.items.map((i: Interno) => i['kind'])).toEqual(['event', 'task']);
      expect(interno['errorMessage']()).toContain('Transacciones caídas');
    });

    it('pinta un chip por ítem visible, con el título como texto', async () => {
      calendarDoble.respuesta = [event('e1', '10:00', 'Dentista')];
      await montar(true);

      const chips = [...host.querySelectorAll('.cw__chip')].map(el => el.textContent!.trim());
      expect(chips).toContain('Dentista');
    });
  });

  describe('móvil — carrusel', () => {
    it('la tarjeta activa arranca en hoy, con sus ítems', async () => {
      calendarDoble.respuesta = [event('e1')];
      await montar(false);

      const active = interno['activeCard']();
      expect(active.iso).toBe(todayIso());
      expect(active.totalCount).toBe(1);
    });

    it('shiftActiveDay mueve el día activo sin tope de semana', async () => {
      await montar(false);
      const inicio = interno['activeDay']();

      interno['shiftActiveDay'](1);
      await estabilizar();

      expect(interno['activeDay']()).not.toBe(inicio);
      expect(interno['activeDay']()).toBe(toIsoDate(sumarDias(inicio, 1)));
    });

    it('toggleDayPanel abre y cierra la agenda del día activo', async () => {
      calendarDoble.respuesta = [event('e1')];
      await montar(false);

      expect(interno['dayPanelExpanded']()).toBeFalse();

      interno['toggleDayPanel']();
      await estabilizar();
      expect(interno['dayPanelExpanded']()).toBeTrue();

      interno['toggleDayPanel']();
      await estabilizar();
      expect(interno['dayPanelExpanded']()).toBeFalse();
    });
  });

  describe('onItemClick', () => {
    it('evento: abre el detalle (detailEventId), no navega', async () => {
      await montar(true);
      const router = TestBed.inject(Router);
      spyOn(router, 'navigate');

      interno['onItemClick']({ id: 'e1', kind: 'event', title: 'X', time: null, tone: 'primary' });

      expect(interno['detailEventId']()).toBe('e1');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('tarea: navega a /tasks/:id', async () => {
      await montar(true);
      const router = TestBed.inject(Router);
      spyOn(router, 'navigate');

      interno['onItemClick']({ id: 't1', kind: 'task', title: 'X', time: null, tone: 'warning' });

      expect(router.navigate).toHaveBeenCalledWith(['/tasks', 't1']);
    });

    it('transacción: navega a /finance/:id', async () => {
      await montar(true);
      const router = TestBed.inject(Router);
      spyOn(router, 'navigate');

      interno['onItemClick']({ id: 'x1', kind: 'transaction', title: 'X', time: null, tone: 'danger' });

      expect(router.navigate).toHaveBeenCalledWith(['/finance', 'x1']);
    });
  });

  it('la revalidación del agente vuelve a pedir mes y semana', async () => {
    await montar(true);
    const peticionesPrevias = calendarDoble.peticiones.length;

    TestBed.inject(DataRefreshService).invalidate();
    await estabilizar();

    expect(calendarDoble.peticiones.length).toBe(peticionesPrevias + 2);
  });
});

function sumarDias(iso: string, dias: number): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day + dias);
}
