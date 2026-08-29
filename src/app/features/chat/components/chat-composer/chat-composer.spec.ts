import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatComposer } from './chat-composer';
import {
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike
} from '../../speech-recognition';

/**
 * Doble de SpeechRecognition.
 *
 * Cada perfil de navegador lo instala en `window` bajo el nombre que usa ese
 * navegador de verdad, así que las pruebas ejercitan la detección real de
 * `speech-recognition.ts` en vez de una versión mockeada de ella.
 */
class FakeRecognition implements SpeechRecognitionLike {
  static last: FakeRecognition | null = null;
  /** Inyectable desde una prueba para simular un `start()` que falla. */
  static startThrows: Error | null = null;

  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 0;

  startCalls = 0;
  stopCalls = 0;
  abortCalls = 0;

  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.last = this;
  }

  start(): void {
    this.startCalls++;
    if (FakeRecognition.startThrows) {
      throw FakeRecognition.startThrows;
    }
  }

  stop(): void {
    this.stopCalls++;
    this.onend?.();
  }

  abort(): void {
    this.abortCalls++;
    this.onerror?.({ error: 'aborted' } as SpeechRecognitionErrorEventLike);
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }

  emitResult(transcript: string): void {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript }], { isFinal: true, length: 1 })]
    } as unknown as SpeechRecognitionEventLike);
  }

  /** Un resultado provisional: el motor aun no lo da por definitivo. */
  emitInterim(transcript: string): void {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript }], { isFinal: false, length: 1 })]
    } as unknown as SpeechRecognitionEventLike);
  }

  /** La API real dispara `error` y DESPUÉS `end`. */
  emitError(code: string): void {
    this.onerror?.({ error: code } as SpeechRecognitionErrorEventLike);
    this.onend?.();
  }
}

type Win = Record<string, unknown>;

/** Perfiles: cada uno expone exactamente lo que ese navegador expone. */
const PERFILES = {
  chromeEscritorio: () => ((window as unknown as Win)['SpeechRecognition'] = FakeRecognition),
  chromeAndroid: () => ((window as unknown as Win)['webkitSpeechRecognition'] = FakeRecognition),
  safariIos: () => ((window as unknown as Win)['webkitSpeechRecognition'] = FakeRecognition),
  firefox: () => undefined
};

function limpiarWindow(): void {
  delete (window as unknown as Win)['SpeechRecognition'];
  delete (window as unknown as Win)['webkitSpeechRecognition'];
}

describe('ChatComposer — dictado por pulsar y mantener', () => {
  let fixture: ComponentFixture<ChatComposer>;

  /**
   * `async` a propósito: `ngModel` dentro de un `<form>` registra su control
   * en una microtarea, así que escribir en el input antes de que la zona se
   * estabilice manda el valor a ninguna parte y el borrador se queda vacío.
   */
  async function montar(): Promise<void> {
    fixture = TestBed.createComponent(ChatComposer);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function mic(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.chat-composer__mic');
  }

  function campo(): HTMLTextAreaElement {
    return fixture.nativeElement.querySelector('textarea[name="draft"]');
  }

  function alerta(): string {
    const el: HTMLElement | null = fixture.nativeElement.querySelector('[role="alert"]');
    return el?.textContent?.trim() ?? '';
  }

  function puntero(tipo: string, clientX: number): void {
    mic().dispatchEvent(new PointerEvent(tipo, { pointerId: 1, clientX, bubbles: true }));
    fixture.detectChanges();
  }

  /**
   * Mas alla del final del carril. El componente lo recorta al ancho real, asi
   * que esto es "arrastrar hasta la papelera" sin depender de cuanto mida el
   * carril en el contenedor de pruebas.
   */
  const HASTA_EL_FINAL = 10_000;

  /** El gesto completo: apretar en 0, arrastrar hasta `hasta`, soltar. */
  function gesto(hasta = 0): void {
    puntero('pointerdown', 0);
    if (hasta !== 0) {
      puntero('pointermove', hasta);
    }
    puntero('pointerup', hasta);
  }

  async function escribir(texto: string): Promise<void> {
    const input = campo();
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    await asentar();
  }

  /** Recoge lo que el componente emite por `send`. */
  function capturarEnvios(): string[] {
    const emitidos: string[] = [];
    fixture.componentInstance.send.subscribe(t => emitidos.push(t));
    return emitidos;
  }

  async function asentar(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    limpiarWindow();
    FakeRecognition.last = null;
    FakeRecognition.startThrows = null;

    await TestBed.configureTestingModule({
      imports: [ChatComposer],
      // Sin esto TestBed usa 'en-US' y la prueba del idioma no probaría nada.
      providers: [{ provide: LOCALE_ID, useValue: 'es-CO' }]
    }).compileComponents();
  });

  afterEach(() => limpiarWindow());

  describe('detección de soporte', () => {
    it('Firefox (sin SpeechRecognition): el botón no se renderiza', async () => {
      PERFILES.firefox();
      await montar();
      expect(mic()).toBeNull();
    });

    it('el placeholder no menciona el micrófono en ningun navegador', async () => {
      // Ni en Firefox, donde el botón no existe y mandaría al usuario a buscar
      // un control ausente, ni en Chrome, donde la frase entera envolvía a
      // cuatro líneas y estiraba la caja antes de escribir nada.
      for (const perfil of [PERFILES.firefox, PERFILES.chromeEscritorio]) {
        limpiarWindow();
        perfil();
        await montar();

        expect(campo().getAttribute('placeholder')).toBe('Escribe un mensaje');
      }
    });

    it('la instrucción del dictado vive en el botón, no en el placeholder', async () => {
      PERFILES.chromeEscritorio();
      await montar();

      // El nombre accesible y el tooltip son el sitio de la instrucción: van
      // en el control que la ejecuta, y no ocupan ancho del campo.
      expect(mic().getAttribute('aria-label')).toContain('Mantén pulsado');
      expect(mic().getAttribute('title')).toContain('Mantén pulsado');
    });

    it('el envío es solo icono pero conserva su nombre accesible', async () => {
      PERFILES.chromeEscritorio();
      await montar();

      const enviar: HTMLButtonElement = fixture.nativeElement.querySelector(
        '.chat-composer__send'
      );
      // Sin `aria-label`, un lector de pantalla lo anuncia como "botón": el
      // icono lleva `aria-hidden` fijo y no aporta nombre.
      expect(enviar.getAttribute('aria-label')).toBe('Enviar mensaje');
      expect(enviar.textContent?.trim()).toBe('');
    });

    it('Chrome Android (solo prefijo webkit): el botón se renderiza', async () => {
      PERFILES.chromeAndroid();
      await montar();
      expect(mic()).not.toBeNull();
    });

    it('Safari iOS (solo prefijo webkit): el botón se renderiza', async () => {
      PERFILES.safariIos();
      await montar();
      expect(mic()).not.toBeNull();
    });

    it('Chrome escritorio (sin prefijo): el botón se renderiza', async () => {
      PERFILES.chromeEscritorio();
      await montar();
      expect(mic()).not.toBeNull();
    });
  });

  describe('el gesto', () => {
    beforeEach(async () => {
      PERFILES.chromeEscritorio();
      await montar();
    });

    it('mantener pulsado arranca la grabación y lo anuncia', () => {
      puntero('pointerdown', 0);

      expect(FakeRecognition.last!.startCalls).toBe(1);
      expect(mic().getAttribute('aria-pressed')).toBe('true');
      expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
        'Grabando'
      );
    });

    it('el idioma sigue al LOCALE_ID de la app', () => {
      puntero('pointerdown', 0);
      expect(FakeRecognition.last!.lang).toBe('es-CO');
    });

    it('soltar sin deslizar transcribe y envia: stop(), nunca abort()', async () => {
      const emitidos = capturarEnvios();

      puntero('pointerdown', 0);
      FakeRecognition.last!.emitResult('hola mundo');
      puntero('pointerup', 0);
      await asentar();

      expect(FakeRecognition.last!.stopCalls).toBe(1);
      expect(FakeRecognition.last!.abortCalls).toBe(0);
      expect(emitidos).toEqual(['hola mundo']);
      // El campo queda limpio para el siguiente mensaje.
      expect(campo().value).toBe('');
    });

    it('si no se reconocio nada, soltar NO envia nada', async () => {
      const emitidos = capturarEnvios();

      puntero('pointerdown', 0);
      puntero('pointerup', 0);
      await asentar();

      expect(emitidos).toEqual([]);
    });

    it('con texto escrito a mano, un dictado vacio no lo manda solo', async () => {
      await escribir('borrador a medias');
      const emitidos = capturarEnvios();

      puntero('pointerdown', 0);
      puntero('pointerup', 0);
      await asentar();

      expect(emitidos).toEqual([]);
      expect(campo().value).toBe('borrador a medias');
    });

    it('el texto dictado se añade al que ya estaba escrito y se envia junto', async () => {
      const emitidos = capturarEnvios();

      await escribir('recuérdame');
      puntero('pointerdown', 0);
      FakeRecognition.last!.emitResult('comprar pan');
      puntero('pointerup', 0);
      await asentar();

      expect(emitidos).toEqual(['recuérdame comprar pan']);
    });

    it('deslizar hasta el final arma la cancelación de forma visible', () => {
      puntero('pointerdown', 0);
      puntero('pointermove', HASTA_EL_FINAL);

      // El aviso es iconográfico, no textual: el carril y el botón cambian de
      // estado. Lo que se dice con palabras vive en la región `role="status"`,
      // que es para lectores de pantalla.
      expect(fixture.nativeElement.querySelector('.chat-composer__lane.is-armed')).not.toBeNull();
      expect(mic().classList).toContain('is-cancelling');
      expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
        'Suelta para cancelar'
      );
    });

    it('soltar tras deslizar cancela: abort(), no se envia y el texto se descarta', async () => {
      const emitidos = capturarEnvios();

      puntero('pointerdown', 0);
      FakeRecognition.last!.emitResult('texto que el usuario canceló');
      gestoSoltarEn(HASTA_EL_FINAL);
      await asentar();

      expect(emitidos).toEqual([]);
      expect(FakeRecognition.last!.abortCalls).toBe(1);
      expect(FakeRecognition.last!.stopCalls).toBe(0);
      expect(campo().value).toBe('');
    });

    function gestoSoltarEn(x: number): void {
      puntero('pointermove', x);
      puntero('pointerup', x);
    }

    it('volver a la izquierda antes de soltar deshace la cancelación', async () => {
      const emitidos = capturarEnvios();

      puntero('pointerdown', 0);
      puntero('pointermove', HASTA_EL_FINAL);
      puntero('pointermove', 5);
      FakeRecognition.last!.emitResult('sí quiero esto');
      puntero('pointerup', 5);
      await asentar();

      expect(FakeRecognition.last!.stopCalls).toBe(1);
      expect(FakeRecognition.last!.abortCalls).toBe(0);
      expect(emitidos).toEqual(['sí quiero esto']);
    });

    it('un deslizamiento corto no cancela (umbral por encima del temblor)', async () => {
      gesto(20);
      expect(FakeRecognition.last!.abortCalls).toBe(0);
      expect(FakeRecognition.last!.stopCalls).toBe(1);
    });

    it('a mitad de carril todavia NO cancela: hay que llegar hasta el final', () => {
      puntero('pointerdown', 0);

      const carril: DOMRect = fixture.nativeElement
        .querySelector('.chat-composer__lane')
        .getBoundingClientRect();
      puntero('pointermove', carril.width / 2);
      puntero('pointerup', carril.width / 2);

      expect(FakeRecognition.last!.abortCalls).toBe(0);
      expect(FakeRecognition.last!.stopCalls).toBe(1);
    });

    it('la pista arranca en el microfono, sin hueco entre los dos', () => {
      puntero('pointerdown', 0);

      const carril: DOMRect = fixture.nativeElement
        .querySelector('.chat-composer__lane')
        .getBoundingClientRect();
      const boton = mic().getBoundingClientRect();

      // La pista empieza en el boton o por debajo de el: si arrancara a su
      // derecha, el recorrido se veria cortado justo en su origen.
      expect(carril.left).toBeLessThanOrEqual(boton.left + 1);
    });

    it('el campo se pinta ENCIMA del microfono y del carril', () => {
      puntero('pointerdown', 0);

      const texto = campo().getBoundingClientRect();
      const boton = mic().getBoundingClientRect();

      // Grabando, la transcripcion va arriba y los controles abajo: el campo
      // tiene que terminar donde el boton empieza, o antes.
      expect(texto.bottom).toBeLessThanOrEqual(boton.top + 1);
    });

    it('el carril existe mientras se graba y desaparece al soltar', () => {
      puntero('pointerdown', 0);
      expect(fixture.nativeElement.querySelector('.chat-composer__lane')).not.toBeNull();

      puntero('pointerup', 0);
      expect(fixture.nativeElement.querySelector('.chat-composer__lane')).toBeNull();
    });

    it('pointercancel (el sistema se lleva el gesto) descarta, no entrega', () => {
      puntero('pointerdown', 0);
      puntero('pointercancel', 0);

      expect(FakeRecognition.last!.abortCalls).toBe(1);
      expect(FakeRecognition.last!.stopCalls).toBe(0);
    });
  });

  describe('errores: ninguno falla en silencio', () => {
    beforeEach(async () => {
      PERFILES.chromeEscritorio();
      await montar();
    });

    it('permiso denegado se explica al usuario', () => {
      puntero('pointerdown', 0);
      FakeRecognition.last!.emitError('not-allowed');
      fixture.detectChanges();

      expect(alerta()).toContain('Permiso de micrófono denegado');
    });

    it('sin red se distingue de un permiso denegado', () => {
      puntero('pointerdown', 0);
      FakeRecognition.last!.emitError('network');
      fixture.detectChanges();

      expect(alerta()).toContain('conexión a internet');
    });

    it('cancelar a propósito NO deja mensaje de error', () => {
      puntero('pointerdown', 0);
      puntero('pointermove', HASTA_EL_FINAL);
      puntero('pointerup', HASTA_EL_FINAL);
      fixture.detectChanges();

      expect(alerta()).toBe('');
    });

    it('si start() lanza, el botón no se queda pegado en "grabando"', () => {
      FakeRecognition.startThrows = new DOMException('already started', 'InvalidStateError');

      expect(() => puntero('pointerdown', 0)).not.toThrow();
      expect(mic().getAttribute('aria-pressed')).toBe('false');
      expect(alerta()).toBeTruthy();
    });

    it('un error deja el botón utilizable otra vez', () => {
      puntero('pointerdown', 0);
      FakeRecognition.last!.emitError('no-speech');
      fixture.detectChanges();
      expect(mic().getAttribute('aria-pressed')).toBe('false');

      puntero('pointerdown', 0);
      expect(mic().getAttribute('aria-pressed')).toBe('true');
    });

    it('sobre http (contexto inseguro) explica que falta HTTPS y no llama a start()', () => {
      const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });

      puntero('pointerdown', 0);
      fixture.detectChanges();

      expect(alerta()).toContain('HTTPS');
      expect(FakeRecognition.last!.startCalls).toBe(0);
      expect(mic().getAttribute('aria-pressed')).toBe('false');

      if (original) {
        Object.defineProperty(window, 'isSecureContext', original);
      }
    });
  });

  describe('teclado (el gesto no puede ser la única vía)', () => {
    beforeEach(async () => {
      PERFILES.chromeEscritorio();
      await montar();
    });

    function tecla(tipo: 'keydown' | 'keyup', key: string, repeat = false): void {
      mic().dispatchEvent(new KeyboardEvent(tipo, { key, repeat, bubbles: true }));
      fixture.detectChanges();
    }

    it('mantener Espacio graba y soltarlo transcribe y envia', async () => {
      const emitidos = capturarEnvios();

      tecla('keydown', ' ');
      expect(mic().getAttribute('aria-pressed')).toBe('true');

      FakeRecognition.last!.emitResult('dictado con teclado');
      tecla('keyup', ' ');
      await asentar();

      expect(FakeRecognition.last!.stopCalls).toBe(1);
      expect(emitidos).toEqual(['dictado con teclado']);
    });

    it('la autorepetición de la tecla no arranca un reconocedor por pulso', () => {
      tecla('keydown', ' ');
      tecla('keydown', ' ', true);
      tecla('keydown', ' ', true);

      expect(FakeRecognition.last!.startCalls).toBe(1);
    });

    it('Escape cancela sin entregar ni enviar texto', async () => {
      const emitidos = capturarEnvios();

      tecla('keydown', ' ');
      FakeRecognition.last!.emitResult('descártalo');
      tecla('keydown', 'Escape');
      await asentar();

      expect(FakeRecognition.last!.abortCalls).toBe(1);
      expect(emitidos).toEqual([]);
      expect(campo().value).toBe('');
    });
  });

  describe('ciclo de vida', () => {
    beforeEach(async () => {
      PERFILES.chromeEscritorio();
      await montar();
    });

    it('al destruir el componente se aborta y se sueltan los handlers', () => {
      puntero('pointerdown', 0);
      const rec = FakeRecognition.last!;

      fixture.destroy();

      expect(rec.abortCalls).toBe(1);
      expect(rec.onresult).toBeNull();
      expect(rec.onend).toBeNull();
    });

    it('un resultado tardío tras destruir no explota', () => {
      puntero('pointerdown', 0);
      const rec = FakeRecognition.last!;
      fixture.destroy();

      expect(() => rec.emitResult('tarde')).not.toThrow();
    });
  });

  describe('transcripcion en vivo', () => {
    beforeEach(async () => {
      PERFILES.chromeEscritorio();
      await montar();
    });

    it('lo provisional se ve en el campo mientras se habla', async () => {
      puntero('pointerdown', 0);
      FakeRecognition.last!.emitInterim('comprando pan');
      await asentar();

      expect(campo().value).toBe('comprando pan');
    });

    it('la vista previa se acumula sobre lo ya escrito, sin pisarlo', async () => {
      await escribir('recuerdame');
      puntero('pointerdown', 0);
      FakeRecognition.last!.emitInterim('comprar pan');
      await asentar();

      expect(campo().value).toBe('recuerdame comprar pan');
    });

    it('cancelar borra la vista previa y deja el borrador como estaba', async () => {
      await escribir('recuerdame');
      puntero('pointerdown', 0);
      FakeRecognition.last!.emitInterim('algo que no queria');
      puntero('pointermove', HASTA_EL_FINAL);
      puntero('pointerup', HASTA_EL_FINAL);
      await asentar();

      expect(campo().value).toBe('recuerdame');
    });

    it('al cerrarse una frase el texto ya reconocido NO desaparece', async () => {
      puntero('pointerdown', 0);
      FakeRecognition.last!.emitInterim('primera parte');
      await asentar();

      // El motor cierra la frase: sus provisionales se van, pero lo definitivo
      // tiene que seguir en pantalla.
      FakeRecognition.last!.emitResult('primera parte');
      await asentar();

      expect(campo().value).toBe('primera parte');
    });
  });

  describe('el campo crece con el contenido', () => {
    beforeEach(async () => {
      PERFILES.chromeEscritorio();
      await montar();
    });

    it('una linea larga deja el campo mas alto que una corta', async () => {
      await escribir('corto');
      const bajo = parseFloat(campo().style.height);

      await escribir('linea uno\nlinea dos\nlinea tres\nlinea cuatro');
      const alto = parseFloat(campo().style.height);

      expect(bajo).toBeGreaterThan(0);
      expect(alto).toBeGreaterThan(bajo);
    });

    it('al borrar vuelve a encoger', async () => {
      await escribir('linea uno\nlinea dos\nlinea tres\nlinea cuatro');
      const alto = parseFloat(campo().style.height);

      await escribir('corto');
      const bajo = parseFloat(campo().style.height);

      expect(bajo).toBeLessThan(alto);
    });

    it('deja de crecer en el tope y pasa a hacer scroll', async () => {
      await escribir(Array.from({ length: 40 }, (_, i) => `linea ${i}`).join('\n'));

      expect(parseFloat(campo().style.height)).toBe(160);
    });
  });

  describe('envío', () => {
    beforeEach(async () => {
      PERFILES.chromeEscritorio();
      await montar();
    });

    it('emite el texto y vacía el campo', async () => {
      const emitidos = capturarEnvios();

      await escribir('  hola  ');
      fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await asentar();

      expect(emitidos).toEqual(['hola']);
      expect(campo().value).toBe('');
    });

    it('Intro en el campo envia', async () => {
      const emitidos = capturarEnvios();

      await escribir('hola');
      campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await asentar();

      expect(emitidos).toEqual(['hola']);
    });

    it('Mayus+Intro NO envia: hace salto de linea', async () => {
      const emitidos = capturarEnvios();

      await escribir('hola');
      campo().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
      );
      await asentar();

      expect(emitidos).toEqual([]);
    });

    it('no envía mientras se está grabando', async () => {
      const emitidos = capturarEnvios();

      await escribir('a medio dictar');
      puntero('pointerdown', 0);
      fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await asentar();

      expect(emitidos).toEqual([]);
    });
  });
});
