import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withRouterConfig, Router, NavigationEnd } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { unwrapInterceptor } from '../../../core/interceptors/unwrap-interceptor';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from '../../../app.routes';
import { setToken, clearToken } from '../../../core/auth/token-storage';
import { TaskDetail } from './task-detail';
import { TaskList } from '../task-list/task-list';
import { TaskResponse } from '../models/task.model';

const ID = '550e8400-e29b-41d4-a716-446655440000';
const OTRO_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const task: TaskResponse = {
  id: ID,
  title: 'Comprar pan',
  description: null,
  status: 'PENDING',
  priority: 'HIGH',
  dueDate: null,
  dueTime: null,
  createdAt: '2026-08-24T10:00:00',
  updatedAt: '2026-08-24T10:00:00'
};

describe('TaskDetail (rutas reales de la app)', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    setToken('fake-token-para-authGuard');
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          routes,
          withComponentInputBinding(),
          withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
          withRouterConfig({ paramsInheritanceStrategy: 'always' })
        ),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => clearToken());

  it('A) navegacion directa al detalle pide el id y PINTA los datos', async () => {
    await harness.navigateByUrl(`/tasks/${ID}`, TaskDetail);

    // `expectOne` ya afirma la URL. Ojo: `http.match()` CONSUME las peticiones
    // de la cola, asi que llamarlo antes dejaria a `expectOne` sin nada.
    const req = http.expectOne(`/api/tasks/${ID}`);
    expect(req.request.method).toBe('GET');

    // Que la peticion salga bien no basta: lo que fallaba para el usuario es
    // que la pantalla no traia datos. Se comprueba el DOM.
    req.flush(task);
    harness.detectChanges();

    const text = harness.routeNativeElement!.textContent!;
    expect(text).withContext('titulo').toContain('Comprar pan');
    expect(text).withContext('estado').toContain('Pendiente');
    expect(text).withContext('prioridad').toContain('Alta');
    expect(text).not.toContain('Cargando');
  });

  it('A2) cambiar de id REUSANDO la instancia vuelve a pedir', async () => {
    await harness.navigateByUrl(`/tasks/${ID}`, TaskDetail);
    http.expectOne(`/api/tasks/${ID}`).flush(task);
    harness.detectChanges();

    await harness.navigateByUrl(`/tasks/${OTRO_ID}`, TaskDetail);
    harness.detectChanges();

    // Es el caso que un `snapshot.paramMap` leido una sola vez se comeria en
    // silencio: misma instancia, id nuevo, pantalla congelada en la anterior.
    expect(http.match(() => true).map(r => r.request.url)).toEqual([`/api/tasks/${OTRO_ID}`]);
  });

  it('B) clic en la fila de la lista', async () => {
    await harness.navigateByUrl('/tasks', TaskList);
    http.expectOne('/api/tasks').flush({ content: [task], totalElements: 1 });
    harness.detectChanges();

    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.task-item__link')!;
    expect(link).withContext('el enlace estirado existe').not.toBeNull();
    expect(link.getAttribute('href')).toBe(`/tasks/${ID}`);

    // `router.navigated` es un BOOLEANO, no una promesa: hacerle await resuelve
    // al instante y el chunk lazy de TaskDetail todavia no ha cargado.
    const arrived = firstValueFrom(
      TestBed.inject(Router).events.pipe(filter(e => e instanceof NavigationEnd))
    );
    link.click();
    await arrived;
    harness.detectChanges();

    expect(http.match(() => true).map(r => r.request.url)).toEqual([`/api/tasks/${ID}`]);
  });

  // Las dos formas de producir el `GET /api/tasks/NaN` reportado. Ambas tienen
  // que quedarse sin peticion, no fallar contra el backend.
  it('D) un segmento que no es un id NO dispara peticion', async () => {
    await harness.navigateByUrl('/tasks/abc', TaskDetail);
    harness.detectChanges();

    expect(http.match(() => true).map(r => r.request.url)).toEqual([]);
    expect(harness.routeNativeElement!.textContent).toContain('no existe');
  });

  it('E) montado sin :id en la ruta NO dispara peticion', async () => {
    // El escenario que producia `GET /api/tasks/NaN`: el parametro no llega.
    // Ahora `paramMap.get('id')` devuelve null y el circuito se corta antes
    // del HTTP en vez de inventarse un id.
    const fixture = TestBed.createComponent(TaskDetail);
    fixture.detectChanges();

    expect(http.match(() => true).map(r => r.request.url)).toEqual([]);
  });

  it('C) /tasks/new sigue llegando al formulario, no al detalle', async () => {
    await harness.navigateByUrl('/tasks/new');
    expect(http.match(r => r.url.startsWith('/api/tasks/')).map(r => r.request.url)).toEqual([]);
  });
});

/**
 * La cadena entera y de verdad: paramMap → TaskService.get(id) → HttpClient →
 * los DOS interceptores reales de la app → componente → DOM.
 *
 * Los tests de arriba inyectan un `TaskResponse` plano, que es lo que el
 * servicio ve DESPUES de desenvolver. Este mete por el cable el sobre
 * `ApiResponse` tal y como lo manda el backend Spring, asi que si
 * `unwrapInterceptor` no reconociera la forma, el body se pintaria vacio —
 * exactamente el sintoma de "no trae los datos".
 */
describe('TaskDetail (cadena completa con interceptores)', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    setToken('fake-token-para-authGuard');
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding(), withRouterConfig({ paramsInheritanceStrategy: 'always' })),
        provideHttpClient(withInterceptors([authInterceptor, unwrapInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => clearToken());

  it('desenvuelve el ApiResponse del backend y lo pinta en el body', async () => {
    await harness.navigateByUrl(`/tasks/${ID}`, TaskDetail);

    const req = http.expectOne(`/api/tasks/${ID}`);

    // El header lo pone authInterceptor: si faltara, el backend responderia 403
    // y la pantalla se quedaria sin datos por una causa que no es el componente.
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token-para-authGuard');

    // El sobre exacto del backend, con los seis campos que isApiResponse exige.
    req.flush({
      timestamp: '2026-08-24T10:00:00',
      status: 200,
      success: true,
      message: 'Task retrieved',
      data: { ...task, description: 'Del super de la esquina', dueDate: '2026-08-30', dueTime: '14:30:00' },
      errors: null
    });
    harness.detectChanges();

    const text = harness.routeNativeElement!.textContent!;
    expect(text).withContext('titulo').toContain('Comprar pan');
    expect(text).withContext('descripcion').toContain('Del super de la esquina');
    expect(text).withContext('vencimiento formateado').toContain('14:30');
    expect(text).withContext('estado').toContain('Pendiente');
    expect(text).withContext('prioridad').toContain('Alta');
    expect(text).withContext('creada').toContain('Creada');
    expect(text).not.toContain('Cargando');
    expect(text).not.toContain('no existe');
  });
});
