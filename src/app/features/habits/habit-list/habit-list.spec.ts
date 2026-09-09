import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { HabitList } from './habit-list';
import { HabitResponse } from '../models/habit.model';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function habit(id: string, name: string, done: boolean, streak = 0): HabitResponse {
  return {
    id,
    name,
    scheduledTime: null,
    currentStreak: streak,
    longestStreak: streak,
    isCompletedToday: done,
    createdAt: '2026-09-01T10:00:00',
    updatedAt: '2026-09-01T10:00:00'
  };
}

/**
 * Pruebas del TOGGLE del check, la primera bateria de la feature.
 *
 * Cubre lo que ni `ng build` ni el tipado ven: que pulsar elija el verbo HTTP
 * correcto, que el estado salga siempre de la respuesta del servidor, y el caso
 * borde de la pausa — la razon por la que `releaseTimers` es un `Map`.
 *
 * `provideServiceWorker(..., { enabled: false })` no es decorativo: `HabitList`
 * inyecta `PushService`, que inyecta `SwPush`. Sin este proveedor el componente
 * ni se instancia — es el mismo `NG0201` que hoy hace fallar `app.spec.ts`.
 */
describe('HabitList — marcar y desmarcar', () => {
  let fixture: ComponentFixture<HabitList>;
  let http: HttpTestingController;

  /** Monta el componente y responde al GET inicial con `habits`. */
  function mount(habits: HabitResponse[]): void {
    fixture = TestBed.createComponent(HabitList);
    fixture.detectChanges();
    http.expectOne('/api/habits').flush(habits);
    fixture.detectChanges();
  }

  function card(id: string): HTMLElement {
    return fixture.nativeElement.querySelector('[data-habit-id="' + id + '"]') as HTMLElement;
  }

  /** El check de una tarjeta, buscado por el id que la plantilla ya expone. */
  function check(id: string): HTMLButtonElement {
    return card(id).querySelector('.habit-check') as HTMLButtonElement;
  }

  function completionsUrl(id: string): string {
    return '/api/habits/' + id + '/completions';
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideServiceWorker('ngsw-worker.js', { enabled: false })
      ]
    });

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('A) pulsar un pendiente hace POST a /completions', () => {
    mount([habit(A, 'Leer', false)]);

    check(A).click();

    const req = http.expectOne(completionsUrl(A));
    expect(req.request.method).toBe('POST');
    req.flush(habit(A, 'Leer', true, 1));
  });

  it('B) pulsar uno YA HECHO hace DELETE, no otro POST', () => {
    mount([habit(A, 'Leer', true, 5)]);

    check(A).click();

    // `expectOne` ya afirma la URL; lo que se comprueba aqui es el VERBO, que
    // es lo unico que distingue marcar de desmarcar sobre la misma direccion.
    const req = http.expectOne(completionsUrl(A));
    expect(req.request.method).toBe('DELETE');
    req.flush(habit(A, 'Leer', false, 0));
  });

  it('C) la racha sale de la respuesta del servidor, no de un calculo local', () => {
    mount([habit(A, 'Leer', true, 5)]);

    check(A).click();

    // El servidor recalcula desde el historial, asi que se responde un valor
    // que NINGUN decremento local produciria a partir de 5.
    http.expectOne(completionsUrl(A)).flush(habit(A, 'Leer', false, 3));
    fixture.detectChanges();

    expect(card(A).textContent).toContain('3');
  });

  it('D) el nombre accesible NO cambia con el estado; lo dice aria-pressed', () => {
    mount([habit(A, 'Leer', false)]);

    const before = check(A).getAttribute('aria-label');
    expect(check(A).getAttribute('aria-pressed')).toBe('false');

    check(A).click();
    http.expectOne(completionsUrl(A)).flush(habit(A, 'Leer', true, 1));
    fixture.detectChanges();

    expect(check(A).getAttribute('aria-pressed')).toBe('true');
    expect(check(A).getAttribute('aria-label')).toBe(before);
  });

  it('E) estar hecho ya no apaga el boton: solo lo apaga la peticion en vuelo', () => {
    mount([habit(A, 'Leer', true, 5)]);

    // Antes de este cambio esto era 'true' de forma permanente.
    expect(check(A).getAttribute('aria-disabled')).toBe('false');

    check(A).click();
    fixture.detectChanges();
    expect(check(A).getAttribute('aria-disabled')).toBe('true');

    http.expectOne(completionsUrl(A)).flush(habit(A, 'Leer', false, 0));
  });

  it('F) un segundo clic con la peticion en vuelo no manda otra', () => {
    mount([habit(A, 'Leer', false), habit(B, 'Correr', false)]);

    check(A).click();
    fixture.detectChanges();
    check(A).click();

    // Una sola peticion para A: `expectOne` falla si hubiera dos.
    http.expectOne(completionsUrl(A)).flush(habit(A, 'Leer', true, 1));
  });

  it('G) desmarcar dentro de la pausa no suelta la retencion SIGUIENTE', fakeAsync(() => {
    mount([habit(A, 'Leer', false), habit(B, 'Correr', false)]);

    // t=0 — marcar. Arranca una pausa que vence en 420ms.
    check(A).click();
    http.expectOne(completionsUrl(A)).flush(habit(A, 'Leer', true, 1));
    fixture.detectChanges();
    expect(card(A).classList).toContain('is-marking');

    // t=100 — desmarcar. Debe CANCELAR el temporizador de la marca anterior.
    tick(100);
    check(A).click();
    http.expectOne(completionsUrl(A)).flush(habit(A, 'Leer', false, 0));
    fixture.detectChanges();
    expect(card(A).classList).not.toContain('is-marking');

    // t=200 — volver a marcar. Su pausa vence en t=620.
    tick(100);
    check(A).click();
    http.expectOne(completionsUrl(A)).flush(habit(A, 'Leer', true, 1));
    fixture.detectChanges();
    expect(card(A).classList).toContain('is-marking');

    // t=500 — el temporizador VIEJO habria vencido en t=420 y habria soltado
    // esta retencion 120ms antes de tiempo. Con el `clearTimeout` de
    // `releaseHold` ya no existe, y la tarjeta sigue en su sitio.
    tick(300);
    fixture.detectChanges();
    expect(card(A).classList).toContain('is-marking');

    // Y suelta cuando le toca, no antes.
    tick(200);
    fixture.detectChanges();
    expect(card(A).classList).not.toContain('is-marking');
  }));

  it('H) un fallo al desmarcar deja la tarjeta como estaba y avisa', () => {
    mount([habit(A, 'Leer', true, 5)]);

    check(A).click();
    http
      .expectOne(completionsUrl(A))
      .flush({ message: 'Servidor no disponible.' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // Sigue marcado: el estado no se toca hasta que el servidor confirma.
    expect(check(A).getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.form-error')?.textContent).toBeTruthy();
  });
});
