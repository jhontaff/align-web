/**
 * Envoltorio sobre la Web Speech API (`SpeechRecognition`).
 *
 * Módulo de utilidad plano, sin DI, igual que `token-storage.ts` o
 * `date-ranges.ts`. El idioma entra por parámetro en vez de estar fijo dentro:
 * quien lo llama inyecta `LOCALE_ID` y así el dictado sigue al locale de la app
 * en lugar de tener una segunda verdad escondida aquí.
 *
 * Lo que expone NO es el reconocedor crudo sino un `Dictation` con tres
 * finales distintos —`finish`, `cancel`, `dispose`—, porque la diferencia
 * entre ellos es justo lo que la API nativa hace fácil de equivocar:
 * `stop()` **entrega** el resultado y `abort()` lo descarta.
 */

/** Los códigos que define la especificación, más los que añadimos nosotros. */
export type SpeechErrorCode =
  | 'no-speech'
  | 'aborted'
  | 'audio-capture'
  | 'network'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'insecure-context'
  | 'start-failed'
  | 'unknown';

export interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  0: { transcript: string };
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  /** Cierra el micro y **entrega** lo reconocido. */
  stop(): void;
  /** Cierra el micro y **descarta** lo reconocido. */
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

export interface DictationHandlers {
  /**
   * Todo lo reconocido, entregado **una sola vez y al terminar**.
   *
   * Que no se emita según llega es deliberado. El motor decide por su cuenta
   * cuándo ha terminado la frase, así que el resultado final puede llegar
   * antes de que el usuario suelte el botón; entregándolo al vuelo, cancelar
   * después no borraría nada y "deslizar para cancelar" sería mentira una de
   * cada dos veces. Se acumula aquí dentro y se entrega solo si el gesto
   * terminó en `finish()`.
   */
  readonly transcript: (text: string) => void;
  /**
   * Vista previa de lo que se lleva reconocido, incluyendo lo que el motor
   * todavía no da por definitivo. Se emite muchas veces durante el dictado y
   * es solo para pintar: nunca es el texto que se confirma.
   *
   * Existe porque sin ella el usuario habla a ciegas y no descubre que se le
   * entendió mal hasta que suelta. Viendo el texto aparecer puede corregirse
   * en el momento o cancelar antes de ensuciar el borrador.
   */
  readonly live: (text: string) => void;
  /** Mensaje ya listo para pintar, en español. `aborted` no llega aquí. */
  readonly error: (message: string) => void;
  /** Siempre se llama exactamente una vez, termine como termine. */
  readonly end: () => void;
}

export interface Dictation {
  start(): void;
  /** Cierra y entrega. Es lo que hace soltar el botón. */
  finish(): void;
  /** Cierra y descarta. Es lo que hace deslizar para cancelar. */
  cancel(): void;
  /** Suelta los handlers. Se llama al destruir el componente. */
  dispose(): void;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

/**
 * Traduce un código de error a algo que un humano pueda leer.
 *
 * Existe porque las causas reales son muy distintas entre sí: un permiso
 * denegado se arregla en la configuración del navegador, `network` no se
 * arregla en absoluto sin conexión (Chrome envía el audio a un servicio
 * remoto) y `no-speech` solo pide repetir. Colapsarlas todas en "no funcionó"
 * deja al usuario sin ninguna acción posible.
 *
 * `aborted` devuelve `null`: es el usuario cancelando a propósito, y avisarle
 * de lo que acaba de pedir es ruido.
 */
export function speechErrorMessage(code: string, lang: string): string | null {
  switch (code) {
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Permiso de micrófono denegado. Habilítalo en el navegador y vuelve a intentarlo.';
    case 'audio-capture':
      return 'No se detectó ningún micrófono.';
    case 'network':
      return 'El dictado necesita conexión a internet.';
    case 'no-speech':
      return 'No se escuchó nada. Inténtalo de nuevo.';
    case 'language-not-supported':
      return `Este navegador no admite el dictado en ${lang}.`;
    case 'insecure-context':
      return 'El dictado necesita una conexión segura (HTTPS).';
    default:
      return 'No se pudo usar el dictado.';
  }
}

/**
 * Separa los resultados nuevos del evento en definitivos y provisionales.
 *
 * Se empieza en `resultIndex` y no en 0 porque `results` es acumulativo: el
 * navegador entrega el array entero en cada evento, así que recorrerlo desde
 * el principio volvería a meter en el buffer frases ya guardadas. Y no basta
 * con `results[0][0]`: Chrome en Android dispara `onresult` varias veces y
 * quedarse con el primero pierde la segunda mitad de lo dicho.
 */
function splitResults(event: SpeechRecognitionEventLike): {
  finales: string[];
  provisionales: string[];
} {
  const finales: string[] = [];
  const provisionales: string[] = [];

  for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
    const resultado = event.results[i];
    if (!resultado) {
      continue;
    }

    // `isFinal !== false` y no `=== true`: si un navegador no lo informa, se
    // trata como definitivo, que es el comportamiento sin resultados
    // provisionales y no pierde texto.
    (resultado.isFinal !== false ? finales : provisionales).push(resultado[0].transcript);
  }

  return { finales, provisionales };
}

export function createDictation(lang: string, handlers: DictationHandlers): Dictation | null {
  const Recognition = getSpeechRecognitionConstructor();

  if (!Recognition) {
    return null;
  }

  const recognition = new Recognition();
  recognition.lang = lang;
  // Provisionales activados: son la única fuente de la vista previa en vivo.
  // El coste es más eventos y menos precisión en lo que se muestra a medias,
  // pero lo que se confirma sigue saliendo solo de los resultados definitivos.
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let cancelled = false;
  let finished = false;
  let running = false;
  const buffer: string[] = [];

  /**
   * `error` y `end` se disparan los dos ante un fallo, y al cancelar llegan
   * `abort` + `end`. Sin esta guarda el consumidor recibiría `end` dos veces y
   * el segundo apagaría un estado que quizá ya había vuelto a encenderse.
   */
  const finishOnce = (): void => {
    if (finished) {
      return;
    }
    finished = true;
    running = false;

    // El orden importa: primero el texto, luego el fin. Al revés, quien
    // escucha apagaría el estado de grabación y recibiría después un texto
    // que ya no espera.
    if (!cancelled && buffer.length > 0) {
      handlers.transcript(buffer.join(' '));
    }

    handlers.end();
  };

  recognition.onresult = event => {
    if (cancelled) {
      return;
    }

    const { finales, provisionales } = splitResults(event);
    buffer.push(...finales);

    // La vista previa es buffer + provisional, no solo lo provisional: cuando
    // el motor cierra una frase, sus resultados provisionales desaparecen, y
    // emitiendo solo esos el texto ya reconocido se borraría de la pantalla a
    // mitad de dictado.
    handlers.live([...buffer, ...provisionales].join(' ').trim());
  };

  recognition.onerror = event => {
    if (!cancelled) {
      const mensaje = speechErrorMessage(event.error, lang);
      if (mensaje) {
        handlers.error(mensaje);
      }
    }
    finishOnce();
  };

  recognition.onend = finishOnce;

  const detach = (): void => {
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  };

  return {
    start(): void {
      // El constructor existe en Chrome Android sobre http, pero `start()`
      // falla: la API exige contexto seguro. Sin este aviso el síntoma es "el
      // botón está ahí y al pulsarlo no pasa nada", indistinguible de un
      // micrófono roto — y es exactamente lo que ocurre al probar desde el
      // móvil contra `http://<ip-local>:4200`.
      if (!window.isSecureContext) {
        handlers.error(speechErrorMessage('insecure-context', lang) as string);
        finishOnce();
        return;
      }

      try {
        recognition.start();
        running = true;
      } catch {
        // `InvalidStateError` si ya había un reconocimiento en curso. Sin este
        // catch la excepción sale del handler del evento y el estado de
        // "grabando" se queda encendido para siempre: el botón muere hasta
        // recargar la página.
        handlers.error(speechErrorMessage('start-failed', lang) as string);
        finishOnce();
      }
    },

    finish(): void {
      if (running) {
        recognition.stop();
      }
    },

    cancel(): void {
      cancelled = true;
      if (running) {
        recognition.abort();
      } else {
        finishOnce();
      }
    },

    dispose(): void {
      cancelled = true;
      if (running) {
        recognition.abort();
      }
      detach();
      finished = true;
      running = false;
    }
  };
}
