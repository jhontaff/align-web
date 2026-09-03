import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateRange, DateRangePreset } from '../../../core/date/date-range';
import { DateRangePicker } from './date-range-picker';

/**
 * Se fija `es-ES` como en `app.config.ts`. Sin esto TestBed usa `en-US` y las
 * etiquetas ("Septiembre de 2026") no serían las que ve el usuario, con lo cual
 * la prueba pasaría mientras la pantalla dice otra cosa.
 */
const LOCALE = 'es-ES';

const SEPTIEMBRE: DateRange = { from: '2026-09-01', to: '2026-09-30' };

const PRESETS: readonly DateRangePreset[] = [
  { id: 'test', label: 'Un preset', range: () => ({ from: '2026-01-01', to: '2026-12-31' }) }
];

describe('DateRangePicker', () => {
  let fixture: ComponentFixture<DateRangePicker>;
  let host: HTMLElement;
  let emitidos: DateRange[];
  let limpiados: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DateRangePicker],
      providers: [{ provide: LOCALE_ID, useValue: LOCALE }]
    }).compileComponents();
  });

  async function montar(range: DateRange | null = SEPTIEMBRE): Promise<void> {
    fixture = TestBed.createComponent(DateRangePicker);
    fixture.componentRef.setInput('range', range);
    fixture.componentRef.setInput('presets', PRESETS);

    host = fixture.nativeElement as HTMLElement;

    emitidos = [];
    limpiados = 0;
    fixture.componentInstance.rangeChange.subscribe(r => emitidos.push(r));
    fixture.componentInstance.clear.subscribe(() => (limpiados += 1));

    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function estabilizar(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function disparador(): HTMLButtonElement {
    return host.querySelector<HTMLButtonElement>('.drp__trigger')!;
  }

  function panel(): HTMLElement | null {
    return host.querySelector<HTMLElement>('.drp__panel');
  }

  function dia(iso: string): HTMLButtonElement | null {
    return host.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`);
  }

  function mesVisible(): string {
    return host.querySelector<HTMLElement>('.drp__month-label')!.textContent!.trim();
  }

  async function abrir(): Promise<void> {
    disparador().click();
    await estabilizar();
  }

  async function clicar(iso: string): Promise<void> {
    dia(iso)!.click();
    await estabilizar();
  }

  async function teclear(key: string, shiftKey = false): Promise<void> {
    host
      .querySelector('.drp__grid')!
      .dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
    await estabilizar();
  }

  // ---------------------------------------------------------------------------

  it('el boton muestra el rango aplicado, y el popover nace cerrado', async () => {
    await montar();

    expect(disparador().textContent).toContain('Septiembre de 2026');
    expect(panel()).toBeNull();
    expect(disparador().getAttribute('aria-expanded')).toBe('false');
  });

  it('abre en el mes del INICIO del rango, no en el mes en curso', async () => {
    // Un rango de marzo con la app abierta en septiembre: si el calendario
    // abriera en "hoy", habría que navegar hasta marzo para ver que hay
    // seleccionado.
    await montar({ from: '2026-03-10', to: '2026-03-20' });
    await abrir();

    expect(mesVisible()).toBe('Marzo de 2026');
    expect(disparador().getAttribute('aria-expanded')).toBe('true');
  });

  it('dos clics emiten el rango completo y cierran', async () => {
    await montar();
    await abrir();

    await clicar('2026-09-05');
    // El primer clic NO emite: un rango a medias no es una pregunta que se le
    // pueda hacer al backend.
    expect(emitidos).toEqual([]);
    expect(panel()).not.toBeNull();

    await clicar('2026-09-20');

    expect(emitidos).toEqual([{ from: '2026-09-05', to: '2026-09-20' }]);
    expect(panel()).toBeNull();
  });

  it('clicar hacia atras INTERCAMBIA los extremos en vez de reiniciar', async () => {
    await montar();
    await abrir();

    await clicar('2026-09-20');
    await clicar('2026-09-05');

    expect(emitidos).toEqual([{ from: '2026-09-05', to: '2026-09-20' }]);
  });

  it('marca inicio, fin y el tramo intermedio', async () => {
    await montar({ from: '2026-09-10', to: '2026-09-12' });
    await abrir();

    expect(dia('2026-09-10')!.classList).toContain('drp__day--start');
    expect(dia('2026-09-11')!.classList).toContain('drp__day--between');
    expect(dia('2026-09-12')!.classList).toContain('drp__day--end');
    expect(dia('2026-09-13')!.classList).not.toContain('drp__day--between');
  });

  it('un preset emite su rango y cierra de un solo clic', async () => {
    await montar();
    await abrir();

    host.querySelector<HTMLButtonElement>('.drp__presets .btn')!.click();
    await estabilizar();

    expect(emitidos).toEqual([{ from: '2026-01-01', to: '2026-12-31' }]);
    expect(panel()).toBeNull();
  });

  it('Escape cierra SIN emitir y devuelve el foco al boton', async () => {
    await montar();
    await abrir();
    await clicar('2026-09-05');

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await estabilizar();

    expect(panel()).toBeNull();
    // La seleccion a medias se descarta: el rango anterior sigue en pie.
    expect(emitidos).toEqual([]);
    expect(document.activeElement).toBe(disparador());
  });

  it('reabrir despues de cancelar no arrastra la seleccion a medias', async () => {
    await montar();
    await abrir();
    await clicar('2026-09-05');

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await estabilizar();
    await abrir();

    // Si el ancla hubiera sobrevivido, este unico clic emitiria un rango.
    await clicar('2026-09-20');
    expect(emitidos).toEqual([]);
  });

  it('las flechas de mes navegan, y la rejilla siempre trae seis semanas', async () => {
    await montar();
    await abrir();

    // Seis filas fijas: un numero variable movería los atajos y el pie bajo el
    // cursor al cambiar de mes.
    expect(host.querySelectorAll('.drp__grid tbody tr').length).toBe(6);

    host.querySelectorAll<HTMLButtonElement>('.drp__nav')[0].click();
    await estabilizar();
    expect(mesVisible()).toBe('Agosto de 2026');

    host.querySelectorAll<HTMLButtonElement>('.drp__nav')[1].click();
    await estabilizar();
    expect(mesVisible()).toBe('Septiembre de 2026');
  });

  it('AvPag desde el 31 de enero cae en febrero, no se lo salta', async () => {
    // El desbordamiento clasico: 31 de enero + 1 mes con aritmetica ingenua da
    // el "31 de febrero", que `Date` normaliza al 3 de marzo. Febrero entero
    // quedaria inalcanzable con esa tecla.
    await montar({ from: '2026-01-31', to: '2026-01-31' });
    await abrir();
    await teclear('PageDown');

    expect(mesVisible()).toBe('Febrero de 2026');
    expect(dia('2026-02-28')!.tabIndex).toBe(0);
  });

  it('las flechas mueven el tabindex movil y cruzan el fin de mes', async () => {
    await montar({ from: '2026-09-30', to: '2026-09-30' });
    await abrir();

    // Solo un dia entra en el orden de tabulacion: 42 botones tabulables
    // obligarian a pulsar Tab decenas de veces para cruzar el calendario.
    expect(host.querySelectorAll('.drp__day[tabindex="0"]').length).toBe(1);
    expect(dia('2026-09-30')!.tabIndex).toBe(0);

    await teclear('ArrowRight');

    expect(mesVisible()).toBe('Octubre de 2026');
    expect(dia('2026-10-01')!.tabIndex).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Sin rango aplicado. `null` es un estado de primera clase, no un valor que
  // falta: es como se expresa "sin filtro", que es con lo que arranca el
  // historial de movimientos.
  // ---------------------------------------------------------------------------

  it('sin rango, el boton dice la etiqueta de vacio y no un rango cualquiera', async () => {
    await montar(null);
    fixture.componentRef.setInput('emptyLabel', 'Todo el historial');
    await estabilizar();

    expect(disparador().textContent).toContain('Todo el historial');
  });

  it('sin rango, el calendario abre en el mes EN CURSO y no marca nada', async () => {
    await montar(null);
    await abrir();

    const hoy = new Date();
    const mesEnCurso = hoy.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
    expect(mesVisible().toLowerCase()).toBe(mesEnCurso.toLowerCase());

    // Nada seleccionado: no hay rango que pintar.
    expect(host.querySelectorAll('.drp__day--start, .drp__day--end, .drp__day--between').length)
      .toBe(0);
  });

  it('el boton de limpiar solo aparece con `clearable`, y emite `clear`', async () => {
    await montar();
    await abrir();
    expect(host.querySelector('.drp__clear')).toBeNull();

    fixture.componentRef.setInput('clearable', true);
    await estabilizar();

    host.querySelector<HTMLButtonElement>('.drp__clear')!.click();
    await estabilizar();

    // `clear` y no un `rangeChange` con null: son dos acciones distintas, y el
    // resumen —que no puede limpiar— no deberia tener que distinguirlas.
    expect(limpiados).toBe(1);
    expect(emitidos).toEqual([]);
    expect(panel()).toBeNull();
  });

  it('limpiar esta deshabilitado cuando ya no hay filtro', async () => {
    await montar(null);
    fixture.componentRef.setInput('clearable', true);
    await estabilizar();
    await abrir();

    expect(host.querySelector<HTMLButtonElement>('.drp__clear')!.disabled).toBe(true);
  });

  it('Inicio y Fin van a los extremos de la semana, con el lunes como primer dia', async () => {
    // El 2 de septiembre de 2026 es miercoles.
    await montar({ from: '2026-09-02', to: '2026-09-02' });
    await abrir();

    await teclear('Home');
    expect(dia('2026-08-31')!.tabIndex).toBe(0); // lunes

    await teclear('End');
    expect(dia('2026-09-06')!.tabIndex).toBe(0); // domingo
  });
});
