import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DataRefreshService } from '../../../../core/data/data-refresh.service';
import { QuickCreate } from './quick-create';

/**
 * El contrato del panel de pestañas, no la pintura.
 *
 * Existe por la misma razón que `gridster-drag.spec.ts`: lo que se rompe aquí no
 * lo ve ni `ng build` ni el tipado. Que un panel oculto siga vivo, que
 * `aria-selected` y `tabindex` se muevan juntos, que las flechas naveguen y que
 * crear invalide el caché de datos son cuatro cosas que se pueden perder en un
 * refactor sin que nada avise — la última dejaría Inicio mostrando datos viejos
 * justo después de que el usuario cree algo.
 */
describe('QuickCreate — pestañas', () => {
  let fixture: ComponentFixture<QuickCreate>;
  let http: HttpTestingController;

  function tabs(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]'));
  }

  function panels(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="tabpanel"]'));
  }

  function visiblePanels(): HTMLElement[] {
    return panels().filter(panel => !panel.hidden);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });

    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(QuickCreate);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('A) monta los cuatro paneles y deja visible solo el activo', () => {
    expect(tabs().length).toBe(4);
    expect(panels().length).toBe(4);

    const visible = visiblePanels();
    expect(visible.length).toBe(1);
    expect(visible[0].getAttribute('aria-labelledby')).toBe(tabs()[0].id);
  });

  it('B) cambiar de pestaña NO destruye el formulario que se deja', () => {
    // El punto entero de ocultar en vez de usar `@switch`: media tarea escrita
    // tiene que seguir ahí al volver.
    const title = fixture.nativeElement.querySelector(
      'app-task-fields input[type="text"]'
    ) as HTMLInputElement;

    title.value = 'Comprar pan';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    tabs()[2].click();
    fixture.detectChanges();

    expect(visiblePanels()[0].getAttribute('aria-labelledby')).toBe(tabs()[2].id);

    tabs()[1].click();
    fixture.detectChanges();

    const again = fixture.nativeElement.querySelector(
      'app-task-fields input[type="text"]'
    ) as HTMLInputElement;
    expect(again.value).toBe('Comprar pan');
  });

  it('B2) cada pestaña lleva su clase de dominio, que es de donde saca el color', () => {
    // El color sale de `quick-create__tab--<id>` en la hoja. Renombrar un id
    // dejaría los cuatro chips grises sin que el build ni el tipado dijeran
    // nada: el `class` se interpola, así que cualquier cadena compila.
    expect(tabs().map(tab => tab.className.split(' ').find(c => c.startsWith('quick-create__tab--')))).toEqual([
      'quick-create__tab--event',
      'quick-create__tab--task',
      'quick-create__tab--transaction',
      'quick-create__tab--habit'
    ]);
  });

  it('B3) los pares fecha+hora se agrupan y cada input conserva su nombre', () => {
    // Al agrupar se quitaron las etiquetas por campo: la visible es la del
    // grupo. El precio es que el nombre accesible de cada input pasa a depender
    // de su `aria-label`, y perderlo no rompe ni el build ni la pantalla — solo
    // deja a un lector de pantalla anunciando dos campos seguidos sin decir
    // cuál es la fecha y cuál la hora.
    const groups: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.date-time-group')
    );

    // Dos del evento (inicio y fin) y uno de la tarea (vencimiento).
    expect(groups.length).toBe(3);

    for (const group of groups) {
      expect(group.getAttribute('role')).toBe('group');

      const labelledBy = group.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      // El id tiene que existir DE VERDAD: un `aria-labelledby` colgando deja al
      // grupo sin nombre, que es peor que no ponerlo.
      expect(fixture.nativeElement.querySelector('#' + labelledBy)).toBeTruthy();

      const inputs: HTMLInputElement[] = Array.from(group.querySelectorAll('input'));
      expect(inputs.map(i => i.type)).toEqual(['date', 'time']);

      for (const input of inputs) {
        expect(input.getAttribute('aria-label')).toBeTruthy();
      }
    }
  });

  it('B4) la barra de pestañas queda FUERA de la zona con scroll', () => {
    // Es el bug que esto arregla: con el panel entero como contenedor de scroll,
    // un formulario alto se llevaba la cabecera y las pestañas fuera de la vista
    // y en un móvil desaparecía la única forma de cambiar de pestaña o cerrar.
    const body = fixture.nativeElement.querySelector('.quick-create__body') as HTMLElement;
    expect(body).toBeTruthy();

    // Los cuatro paneles dentro, la barra y la cabecera fuera.
    expect(body.querySelectorAll('[role="tabpanel"]').length).toBe(4);
    expect(body.querySelector('[role="tablist"]')).toBeNull();
    expect(body.querySelector('.quick-create__header')).toBeNull();

    // Y es el cuerpo quien scrollea, no el panel: si el `overflow` volviera al
    // panel, el DOM seguiría igual y solo se vería al llenarlo de contenido.
    expect(getComputedStyle(body).overflowY).toBe('auto');

    const panel = fixture.nativeElement.querySelector('.quick-create__panel') as HTMLElement;
    expect(getComputedStyle(panel).overflowY).toBe('visible');
  });

  it('B5) la etiqueta de cada pestaña vive en el DOM, no en un aria-label', () => {
    // En móvil la etiqueta de los chips NO activos se oculta A LA VISTA, pero
    // tiene que seguir en el árbol de accesibilidad: es de donde sale el nombre
    // del botón. Si alguien cambia el recorte por `display: none` —o quita el
    // `<span>` y lo sustituye por un `aria-label`— tres de los cuatro chips se
    // anuncian sin nombre y nada en el build avisa.
    const labels = tabs().map(tab =>
      tab.querySelector('.quick-create__tab-label')?.textContent?.trim()
    );

    expect(labels).toEqual(['Evento', 'Tarea', 'Movimiento', 'Hábito']);

    // Y no hay `aria-label` compitiendo: con texto visible, un `aria-label`
    // sustituye al nombre en vez de sumarse, y es como se rompe "label in name".
    expect(tabs().every(tab => !tab.hasAttribute('aria-label'))).toBe(true);
  });

  it('B6) cambiar de pestaña anima el alto del diálogo entre los dos medidos', async () => {
    // Los dos altos se fuerzan en vez de fiarse de lo que mida el iframe de
    // Karma: si los dos formularios tocaran el tope de `max-height`, la guarda
    // de `select()` se saltaría la animación y la prueba fallaría por el
    // entorno, no por el código.
    const dialogEl = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

    spyOn(window, 'matchMedia').and.returnValue({
      matches: false,
      addEventListener: () => {}
    } as unknown as MediaQueryList);

    let measurement = 0;
    spyOn(dialogEl, 'getBoundingClientRect').and.callFake(
      () => ({ height: measurement++ === 0 ? 500 : 300 }) as DOMRect
    );

    const animate = spyOn(dialogEl, 'animate').and.returnValue({
      cancel: () => {}
    } as unknown as Animation);

    tabs()[3].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(animate).toHaveBeenCalled();

    const keyframes = animate.calls.mostRecent().args[0] as Keyframe[];
    expect(keyframes[0]['height']).toBe('500px');
    expect(keyframes[1]['height']).toBe('300px');

    // Sin `fill`: al acabar, el diálogo vuelve a su alto natural y no queda un
    // estilo en línea peleando con el `max-height`.
    const options = animate.calls.mostRecent().args[1] as KeyframeAnimationOptions;
    expect(options.fill).toBeUndefined();
  });

  it('B7) volver a pulsar la pestaña activa no anima nada', async () => {
    const dialogEl = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const animate = spyOn(dialogEl, 'animate');

    tabs()[0].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(animate).not.toHaveBeenCalled();
  });

  it('C) aria-selected y tabindex se mueven juntos: solo la activa es tabulable', () => {
    tabs()[2].click();
    fixture.detectChanges();

    const selected = tabs().map(tab => tab.getAttribute('aria-selected'));
    const tabindex = tabs().map(tab => tab.getAttribute('tabindex'));

    expect(selected).toEqual(['false', 'false', 'true', 'false']);
    expect(tabindex).toEqual(['-1', '-1', '0', '-1']);
  });

  it('D) las flechas navegan entre pestañas y dan la vuelta', () => {
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');

    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');

    // Desde la primera hacia atrás se va a la última, no se queda clavada.
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[3].getAttribute('aria-selected')).toBe('true');

    tabs()[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');

    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[3].getAttribute('aria-selected')).toBe('true');
  });

  it('E) una tecla que no es de navegación se deja pasar', () => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    tabs()[0].dispatchEvent(event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(false);
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('F) crear invalida DataRefreshService y avisa a Inicio', () => {
    const invalidated = jasmine.createSpy('changes');
    TestBed.inject(DataRefreshService).changes.subscribe(invalidated);

    const created = jasmine.createSpy('created');
    fixture.componentInstance.created.subscribe(created);

    // Pestaña "Hábito": es el alta con menos campos, así que la prueba mide el
    // cableado y no el formulario.
    tabs()[3].click();
    fixture.detectChanges();

    const name = fixture.nativeElement.querySelector(
      'app-habit-fields input[type="text"]'
    ) as HTMLInputElement;
    name.value = 'Leer 20 minutos';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('app-habit-fields form') as HTMLFormElement
    ).dispatchEvent(new Event('submit'));

    http.expectOne({ method: 'POST', url: '/api/habits' }).flush({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Leer 20 minutos',
      scheduledTime: null,
      currentStreak: 0,
      longestStreak: 0,
      isCompletedToday: false,
      createdAt: '2026-09-01T10:00:00',
      updatedAt: '2026-09-01T10:00:00'
    });
    fixture.detectChanges();

    expect(invalidated).toHaveBeenCalled();
    expect(created).toHaveBeenCalledWith('Hábito creado.');
  });
});
