import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LOCALE_ID } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CalendarService } from '../../calendar.service';
import { EventResponse } from '../../models/event.model';
import { EventDetail } from './event-detail';

const EVENTO: EventResponse = {
  id: 'e1',
  title: 'Reunión con el equipo',
  description: null,
  startAt: '2026-09-10T10:00:00',
  endAt: null,
  location: null,
  reminderMinutesBefore: null,
  createdAt: '2026-09-10T00:55:00Z',
  updatedAt: '2026-09-10T00:55:00Z'
};

class CalendarServiceDoble {
  get(): Observable<EventResponse> {
    return of(EVENTO);
  }
}

/**
 * La cabecera de la burbuja de evento, que sigue el mismo patrón que las de
 * tarea y movimiento: rótulo del dominio y acciones arriba, título abajo.
 *
 * Se prueba la COLOCACIÓN y no las clases porque es lo que se ha roto las dos
 * veces anteriores, y de formas que ni el build ni el tipado ven: un `order`
 * que falta deja el título arriba y baja los botones solos, y un
 * `grid-column` que falta deja el título en media cabecera.
 */
describe('EventDetail (cabecera)', () => {
  let fixture: ComponentFixture<EventDetail>;
  let raiz: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventDetail],
      providers: [
        { provide: CalendarService, useClass: CalendarServiceDoble },
        { provide: LOCALE_ID, useValue: 'es-ES' }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EventDetail);
    fixture.componentRef.setInput('eventId', 'e1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    raiz = fixture.nativeElement;
  });

  const caja = (selector: string) =>
    (raiz.querySelector(selector) as HTMLElement).getBoundingClientRect();

  it('la cabecera es una rejilla de dos columnas', () => {
    const header = raiz.querySelector('.event-detail__header') as HTMLElement;
    expect(getComputedStyle(header).display).toBe('grid');
  });

  it('rótulo y acciones comparten la primera fila', () => {
    const rotulo = caja('.event-detail__domain');
    const acciones = caja('.event-detail__actions');

    // Con `align-items: center` dos alturas distintas no coinciden al píxel:
    // se compara contra la altura de la fila, no contra cero.
    expect(Math.abs(rotulo.top - acciones.top)).toBeLessThan(24);

    // Y las acciones a la derecha del rótulo, no debajo.
    expect(acciones.left).toBeGreaterThan(rotulo.left);
  });

  it('el título baja a la segunda fila y ocupa las dos columnas', () => {
    const header = caja('.event-detail__header');
    const rotulo = caja('.event-detail__domain');
    const titulo = caja('.event-detail__title');

    expect(titulo.top).toBeGreaterThan(rotulo.top);

    // Lo que comprueba el `grid-column: 1 / -1`: sin él el título se quedaría
    // en la columna izquierda, con la de los botones vacía a su lado.
    expect(titulo.width).toBeGreaterThan(header.width * 0.9);
  });

  it('el rótulo se ve también mientras carga, cuando el título aún es genérico', async () => {
    const enCarga = TestBed.createComponent(EventDetail);
    enCarga.componentRef.setInput('eventId', 'e2');
    enCarga.detectChanges();

    expect(enCarga.nativeElement.querySelector('.event-detail__domain')?.textContent?.trim())
      .toBe('Calendario');
  });
});
