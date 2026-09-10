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

  /** `TaskDetailDialog` se auto-carga por id al montarse, igual que `EventDetail`. */
  get(id: string): Observable<TaskResponse> {
    return of(task(id));
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

  /** Ver `TaskServiceDoble.get`. */
  get(id: string): Observable<TransactionResponse> {
    return of(transaction(id));
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
  /**
   * `animaciones` va apagado por defecto, como en `TestBed`: con `animate.leave` un nodo que se va
   * sigue en el DOM mientras dura su animación, y eso solo lo quieren las pruebas del deslizamiento.
   */
  async function montar(isDesktop: boolean, animaciones = false): Promise<void> {
    await TestBed.configureTestingModule({
      animationsEnabled: animaciones,
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

    // Las dos pruebas de abajo afirmaban lo contrario hasta el 2026-09-10:
    // tarea y transacción navegaban a su ruta y sacaban al usuario de Inicio.
    // Que NO se navegue es ahora la mitad importante del contrato — sin ese
    // `not.toHaveBeenCalled()` la prueba pasaría igual abriendo el diálogo Y
    // navegando por detrás.
    it('tarea: abre el detalle en burbuja (detailTaskId), no navega', async () => {
      await montar(true);
      const router = TestBed.inject(Router);
      spyOn(router, 'navigate');

      interno['onItemClick']({ id: 't1', kind: 'task', title: 'X', time: null, tone: 'warning' });

      expect(interno['detailTaskId']()).toBe('t1');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('transacción: abre el detalle en burbuja (detailTransactionId), no navega', async () => {
      await montar(true);
      const router = TestBed.inject(Router);
      spyOn(router, 'navigate');

      interno['onItemClick']({ id: 'x1', kind: 'transaction', title: 'X', time: null, tone: 'danger' });

      expect(interno['detailTransactionId']()).toBe('x1');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    // Las cuatro de aquí fijan el contrato que se rompía cuando la agenda y el diálogo compartían signal.
    it('abrir un ítem NO cierra la agenda del día', async () => {
      await montar(true);
      interno['toggleDayPanel']();
      await estabilizar();
      expect(interno['dayPanelExpanded']()).toBeTrue();

      interno['onItemClick']({ id: 'e1', kind: 'event', title: 'X', time: null, tone: 'primary' });
      await estabilizar();

      expect(interno['detailEventId']()).toBe('e1');
      expect(interno['dayPanelExpanded']())
        .withContext('la agenda debe seguir desplegada por detrás del diálogo')
        .toBeTrue();
    });

    it('cerrar el diálogo devuelve al usuario con la agenda todavía abierta', async () => {
      await montar(true);
      interno['toggleDayPanel']();
      interno['onItemClick']({ id: 'e1', kind: 'event', title: 'X', time: null, tone: 'primary' });
      await estabilizar();

      interno['onPanelClose']();
      await estabilizar();

      expect(interno['detailEventId']()).toBeNull();
      expect(interno['dayPanelExpanded']()).toBeTrue();
    });

    it('con la agenda CERRADA, abrir y cerrar un ítem no la despliega', async () => {
      await montar(true);
      expect(interno['dayPanelExpanded']()).toBeFalse();

      interno['onItemClick']({ id: 'e1', kind: 'event', title: 'X', time: null, tone: 'primary' });
      await estabilizar();
      interno['onPanelClose']();
      await estabilizar();

      // El otro lado del contrato: cerrar no debe desplegar una agenda que nunca estuvo abierta.
      expect(interno['dayPanelExpanded']()).toBeFalse();
    });

    it('guardar una edición tampoco pliega la agenda', async () => {
      await montar(true);
      interno['toggleDayPanel']();
      interno['onItemClick']({ id: 't1', kind: 'task', title: 'X', time: null, tone: 'warning' });
      await estabilizar();

      interno['onItemChanged']();
      await estabilizar();

      expect(interno['detailTaskId']()).toBeNull();
      expect(interno['dayPanelExpanded']()).toBeTrue();
    });

    it('editar desde el detalle de una tarea encadena a la burbuja de edición', async () => {
      await montar(true);
      interno['onItemClick']({ id: 't1', kind: 'task', title: 'X', time: null, tone: 'warning' });
      await estabilizar();

      interno['onTaskEdit'](task('t1'));

      // Las ramas son excluyentes: al pasar a edición, el detalle se apaga.
      expect(interno['editTask']()?.id).toBe('t1');
      expect(interno['detailTaskId']()).toBeNull();
    });

    it('guardar o borrar desde una burbuja cierra e invalida, no recarga solo el widget', async () => {
      await montar(true);
      const invalidate = spyOn(TestBed.inject(DataRefreshService), 'invalidate').and.callThrough();
      interno['onItemClick']({ id: 't1', kind: 'task', title: 'X', time: null, tone: 'warning' });
      await estabilizar();

      interno['onItemChanged']();
      await estabilizar();

      expect(interno['detailTaskId']()).toBeNull();
      // Invalidar y no `load()`: así se enteran también las tarjetas de resumen de la pantalla.
      expect(invalidate).toHaveBeenCalled();
    });
  });

  describe('deslizamiento del carrusel', () => {
    const tarjetas = () =>
      fixture.nativeElement.querySelectorAll('.cw__carousel-card') as NodeListOf<HTMLElement>;

    it('la dirección vive en la PISTA, para que la tarjeta saliente la herede', async () => {
      await montar(false);
      const pista = fixture.nativeElement.querySelector('.cw__carousel-track') as HTMLElement;

      interno['shiftActiveDay'](1);
      fixture.detectChanges();
      expect(pista.style.getPropertyValue('--cw-dir').trim()).toBe('1');

      // Hay que dejar pasar el guard de `transitioning`: un segundo cambio inmediato ya no se acepta.
      await new Promise(resolve => setTimeout(resolve, 300));

      interno['shiftActiveDay'](-1);
      fixture.detectChanges();
      expect(pista.style.getPropertyValue('--cw-dir').trim()).toBe('-1');
    });

    it('al cambiar de día conviven dos tarjetas: la que entra y la que sale', async () => {
      await montar(false, true);
      expect(tarjetas().length).toBe(1);

      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      // Esto separa un deslizamiento de un relevo: sin `animate.leave` solo se vería entrar la nueva.
      expect(tarjetas().length).toBe(2);
    });

    it('la tarjeta saliente sale del flujo mientras se va', async () => {
      await montar(false, true);
      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      const saliente = fixture.nativeElement.querySelector(
        '.cw__carousel-card--leaving'
      ) as HTMLElement;

      // Con las dos en el flujo la pista tendría cuatro hijos y el carrusel daría un salto lateral.
      expect(getComputedStyle(saliente).position).toBe('absolute');
    });

    it('las vecinas acompañan: también entran y salen', async () => {
      await montar(false, true);
      expect(fixture.nativeElement.querySelectorAll('.cw__carousel-peek').length).toBe(2);

      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      // Dos que entran y dos que se van: sin esto las vecinas solo cambiaban de número,
      // y el carrusel se leía a dos velocidades.
      expect(fixture.nativeElement.querySelectorAll('.cw__carousel-peek').length).toBe(4);
      expect(fixture.nativeElement.querySelectorAll('.cw__carousel-peek--leaving').length).toBe(2);
    });

    it('la vecina saliente se ancla a su hueco, no al centro de la pista', async () => {
      await montar(false, true);
      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      const saliente = fixture.nativeElement.querySelector(
        '.cw__carousel-peek--leaving'
      ) as HTMLElement;
      const hueco = saliente.parentElement as HTMLElement;

      expect(hueco.classList).toContain('cw__carousel-peek-slot');
      expect(getComputedStyle(hueco).position).toBe('relative');
      expect(getComputedStyle(saliente).position).toBe('absolute');
    });

    it('los huecos de las vecinas NO se recrean al cambiar de día', async () => {
      await montar(false, true);
      const antes = fixture.nativeElement.querySelector('.cw__carousel-peek-slot');

      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      // Si el hueco se recreara, la saliente perdería su ancla a media animación y saltaría.
      expect(fixture.nativeElement.querySelector('.cw__carousel-peek-slot')).toBe(antes);
    });

    /** Riesgo propio de `animate.leave`: si la animación no arranca, el nodo se queda en el DOM para siempre. */
    it('la tarjeta saliente acaba desapareciendo del DOM', async () => {
      await montar(false, true);
      interno['shiftActiveDay'](1);
      fixture.detectChanges();
      expect(tarjetas().length).toBe(2);

      await new Promise(resolve => setTimeout(resolve, 600));
      fixture.detectChanges();

      expect(tarjetas().length).toBe(1);
      expect(fixture.nativeElement.querySelector('.cw__carousel-card--leaving')).toBeNull();
      expect(fixture.nativeElement.querySelector('.cw__carousel-peek--leaving')).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.cw__carousel-peek').length).toBe(2);
    });

    /**
     * El parpadeo. La prueba que faltaba: ninguna otra mira la opacidad a lo largo del tiempo.
     * Causa: `cw-carousel-card-out` declaraba `opacity: 0` en el 60% pero no en el `to`, y el
     * navegador sintetiza el `100%` que falta con el valor subyacente, que es 1. Hacía 1 → 0 → 1.
     * Se afirma monotonía y no valores: lo que no puede pasar es que suba, dure lo que dure.
     */
    it('la opacidad de la tarjeta saliente nunca vuelve a subir', async () => {
      await montar(false, true);
      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      const muestras: number[] = [];
      for (let i = 0; i < 12; i++) {
        const saliente = fixture.nativeElement.querySelector(
          '.cw__carousel-card--leaving'
        ) as HTMLElement | null;
        if (!saliente) {
          break;
        }
        muestras.push(Number(getComputedStyle(saliente).opacity));
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      expect(muestras.length)
        .withContext('no se llegó a muestrear la tarjeta saliente')
        .toBeGreaterThan(3);

      const repunte = muestras.findIndex((valor, i) => i > 0 && valor > muestras[i - 1] + 0.01);
      expect(repunte)
        .withContext(`la opacidad repuntó en la muestra ${repunte}: [${muestras.join(', ')}]`)
        .toBe(-1);
    });

    it('la vecina que entra se pinta por encima de la que se va', async () => {
      await montar(false, true);
      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      const entrante = fixture.nativeElement.querySelector(
        '.cw__carousel-peek:not(.cw__carousel-peek--leaving)'
      ) as HTMLElement;

      // `z-index` solo cuenta en posicionados: sin `position`, cualquier posicionado se pintaba encima.
      expect(getComputedStyle(entrante).position).toBe('relative');
      expect(getComputedStyle(entrante).zIndex).toBe('1');
    });

    /**
     * El bloqueo mientras la tarjeta anterior sigue animándose; evita un salto medido de x=321 a x=257.
     * No confundir con el parpadeo: ese era del `@keyframes` y tiene su propia prueba.
     */
    it('un segundo cambio de día mientras la tarjeta sigue animándose se ignora', async () => {
      await montar(false, true);
      const inicio = interno['activeDay']();

      interno['shiftActiveDay'](1);
      fixture.detectChanges();
      const trasElPrimero = interno['activeDay']();
      expect(trasElPrimero).not.toBe(inicio);

      // Este segundo cambio llega ANTES de que la animación de 280ms termine.
      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      expect(interno['activeDay']())
        .withContext('el segundo shiftActiveDay no debió moverse: la tarjeta anterior seguía en el aire')
        .toBe(trasElPrimero);
    });

    it('pasada la animación, el carrusel vuelve a aceptar cambios de día', async () => {
      await montar(false, true);
      interno['shiftActiveDay'](1);
      fixture.detectChanges();
      const trasElPrimero = interno['activeDay']();

      await new Promise(resolve => setTimeout(resolve, 300));

      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      expect(interno['activeDay']()).not.toBe(trasElPrimero);
    });

    it('con movimiento reducido no hay animación que interrumpir, así que el bloqueo no aplica', async () => {
      spyOn(window, 'matchMedia').and.returnValue({
        matches: true,
        addEventListener: () => {}
      } as unknown as MediaQueryList);

      await montar(false, true);
      interno['shiftActiveDay'](1);
      fixture.detectChanges();
      const trasElPrimero = interno['activeDay']();

      // Sin esperar nada: si el guard bloqueara igual, este segundo cambio se perdería.
      interno['shiftActiveDay'](1);
      fixture.detectChanges();

      expect(interno['activeDay']()).not.toBe(trasElPrimero);
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
