import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  OnDestroy,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../../../shared/ui/icon/icon';
import { Dictation, createDictation, isSpeechRecognitionSupported } from '../../speech-recognition';

/**
 * Qué fracción del carril hay que recorrer para armar la cancelación.
 *
 * El recorrido llega hasta la papelera, al final del carril, y no se corta a
 * media fila: arrastrar hasta el borde es el gesto, y pararlo antes deja al
 * usuario sin saber si ya vale o le falta. Se arma un poco antes del tope
 * porque exigir el píxel exacto convierte un gesto en puntería.
 */
const CANCEL_THRESHOLD_RATIO = 0.75;

/**
 * Suelo del umbral, en píxeles CSS.
 *
 * En una ventana estrecha el 75% del carril puede quedarse en muy poco, y por
 * debajo de ~60px el temblor normal del pulgar al sostener el teléfono llega
 * a cruzarlo: cancelaría dictados que el usuario quería conservar.
 */
const MIN_CANCEL_THRESHOLD_PX = 60;

/**
 * Altura máxima del campo antes de empezar a hacer scroll dentro, en píxeles.
 * Unas seis líneas: suficiente para ver un mensaje largo entero sin que el
 * campo se coma la conversación que hay encima.
 */
const MAX_FIELD_HEIGHT_PX = 160;

/**
 * El campo de texto, el botón de dictado y el envío. Dueño del borrador y de
 * nada más: emite el texto y deja que el montaje decida qué hacer con él.
 *
 * El dictado es **pulsar y mantener**, con deslizar a la derecha para cancelar
 * y soltar para transcribir. Se eligió sobre el toggle de un solo clic porque
 * el gesto lleva su propia salida: con un toggle, cancelar exige un segundo
 * clic sobre el mismo botón, que es indistinguible del clic que confirma.
 *
 * Todo el gesto va sobre Pointer Events y no sobre `touch*` + `mouse*`: es una
 * sola ruta de código para dedo, ratón y lápiz, y `setPointerCapture` es lo
 * que hace que el `pointermove` siga llegando cuando el dedo ya salió del
 * botón — que es precisamente lo que pasa al deslizar para cancelar.
 */
@Component({
  selector: 'app-chat-composer',
  imports: [FormsModule, Icon],
  templateUrl: './chat-composer.html',
  styleUrl: './chat-composer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComposer implements OnDestroy {
  readonly sending = input(false);
  readonly send = output<string>();

  private readonly locale = inject(LOCALE_ID);
  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');
  private readonly mic = viewChild<ElementRef<HTMLButtonElement>>('mic');
  private readonly lane = viewChild<ElementRef<HTMLElement>>('lane');

  private dictation: Dictation | null = null;
  private pointerId: number | null = null;
  private startX = 0;

  /**
   * Si este gesto llegó a producir texto. Decide si al soltar se envía.
   *
   * Hace falta una bandera y no basta con mirar el borrador: puede tener texto
   * de antes, escrito a mano, y soltar un dictado que no reconoció nada no
   * debe mandarlo. Se envía porque hubo transcripción, no porque haya texto.
   */
  private transcribed = false;

  /**
   * Recorrido disponible en píxeles, medido del DOM. `-1` = aún sin medir.
   *
   * No puede ser una constante porque el carril ocupa el ancho que sobra, que
   * depende de la ventana. Se mide una vez por gesto y no en cada `pointermove`:
   * `getBoundingClientRect()` fuerza un reflow, y llamarlo a 120Hz mientras se
   * arrastra es justo el trabajo que hace que un gesto se sienta pegajoso.
   */
  private maxTravel = -1;

  // Signals y no propiedades planas porque el dictado las escribe desde los
  // callbacks de SpeechRecognition, que no son eventos de plantilla: con
  // OnPush una propiedad plana dejaría de repintarse al dictar.
  protected readonly draft = signal('');
  protected readonly liveText = signal('');
  protected readonly recording = signal(false);
  protected readonly willCancel = signal(false);
  protected readonly dragX = signal(0);
  protected readonly errorMessage = signal<string | null>(null);

  // No es signal: el soporte del navegador no cambia durante la sesión.
  protected readonly voiceSupported = isSpeechRecognitionSupported();

  /**
   * Lo que se ve en el campo: el borrador más la vista previa del dictado.
   *
   * La previa NO se escribe en `draft`. Así cancelar es dejar de mostrarla, y
   * no hay que acordarse de deshacer nada ni existe el instante en el que el
   * borrador contiene texto que el usuario todavía no ha confirmado.
   */
  protected readonly displayText = computed(() => {
    const base = this.draft();
    const live = this.liveText();

    if (!live) {
      return base;
    }

    return base.trim() ? `${base.trim()} ${live}` : live;
  });

  protected readonly micTransform = computed(() => `translateX(${this.dragX()}px)`);

  /**
   * Cuánto se lleva recorrido, de 0 a 1. Pinta el relleno del carril: sin esa
   * barra el usuario no tiene forma de saber cuánto le falta para soltar sobre
   * la papelera, que es la queja clásica de los gestos de deslizar.
   */
  protected readonly laneFill = computed(() => {
    const total = this.maxTravelOrFallback();
    const avance = total > 0 ? Math.min(1, this.dragX() / total) : 0;
    return `scaleX(${avance})`;
  });

  /**
   * Lo que se anuncia por voz.
   *
   * Es el único sitio donde el estado se dice con palabras: en pantalla lo
   * cuentan el micrófono en rojo, el carril y la papelera. Por eso esta
   * región no es redundante y no se puede quitar con el resto del texto.
   *
   * Vive fuera del botón porque los lectores de pantalla no reannuncian de
   * forma fiable el nombre de un elemento que ya tiene el foco — el mismo
   * motivo por el que `theme-toggle` tiene la suya.
   *
   * Anuncia el estado, no la transcripción: los resultados provisionales
   * cambian varias veces por segundo y leerlos en voz alta sería un atropello
   * continuo. El texto reconocido queda en el campo, que sí se puede leer con
   * calma al terminar.
   */
  protected readonly status = computed(() => {
    if (!this.recording()) {
      return '';
    }
    return this.willCancel() ? 'Suelta para cancelar el dictado' : 'Grabando';
  });

  /**
   * El texto del campo vacío. Dos palabras, y no una frase que explique el
   * gesto del dictado.
   *
   * Un placeholder no es el sitio para documentar: en el ancho real del panel
   * "mantén pulsado el micrófono para enviar" envolvía a cuatro líneas y
   * estiraba la caja entera antes de escribir nada. La instrucción vive donde
   * corresponde, en el `aria-label` y el `title` del micrófono — el control
   * que la ejecuta. Así tampoco hay que ramificar por `voiceSupported` para no
   * prometer un botón que Firefox no renderiza.
   */
  protected readonly placeholder = computed(() =>
    this.recording() ? 'Escuchando…' : 'Escribe un mensaje'
  );

  protected readonly micLabel = computed(() =>
    this.recording()
      ? 'Grabando. Suelta para enviar o desliza a la derecha para cancelar'
      : 'Mantén pulsado para dictar y enviar'
  );

  constructor() {
    // `afterRenderEffect` y no `effect`: hay que LEER del DOM (`scrollHeight`),
    // y eso solo da un número correcto una vez pintado el texto nuevo. Un
    // `effect` corre antes del render y mediría la altura anterior.
    afterRenderEffect(() => {
      // Dependencias explícitas: el campo se remide al teclear, cuando el
      // dictado alarga la vista previa, y al entrar o salir de grabación
      // —ahí cambia de fila y de ancho, así que su altura también cambia.
      this.displayText();
      this.recording();
      this.resizeField();
    });
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  // --- Gesto de puntero -----------------------------------------------------

  protected onPointerDown(event: PointerEvent): void {
    if (this.recording() || this.sending()) {
      return;
    }

    // Sin esto el navegador puede interpretar el arrastre como scroll o como
    // selección de texto y dejar de mandar `pointermove`.
    event.preventDefault();

    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.capturePointer(event, true);

    this.beginDictation();
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.recording() || event.pointerId !== this.pointerId) {
      return;
    }

    // Se mide aquí y no en `pointerdown` porque el carril todavía no existe en
    // el DOM en ese momento: se crea al pintar el estado de grabación.
    if (this.maxTravel < 0) {
      this.maxTravel = this.measureTravel();
    }

    // Solo cuenta el desplazamiento hacia la derecha; volver a la izquierda
    // deshace la cancelación, que es lo que permite arrepentirse a mitad del
    // gesto sin levantar el dedo.
    const dx = Math.max(0, event.clientX - this.startX);
    const total = this.maxTravelOrFallback();

    // El botón se planta sobre la papelera aunque el dedo siga: pasado el final
    // del carril ya no hay a dónde ir.
    this.dragX.set(Math.min(dx, total));
    this.willCancel.set(
      dx >= Math.max(MIN_CANCEL_THRESHOLD_PX, total * CANCEL_THRESHOLD_RATIO)
    );
  }

  protected onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) {
      return;
    }

    this.releasePointer(event);

    if (this.willCancel()) {
      this.dictation?.cancel();
    } else {
      this.dictation?.finish();
    }
  }

  /**
   * `pointercancel` lo dispara el navegador cuando se lleva el gesto (una
   * llamada entrante, el gesto de "atrás" del sistema). Ahí no hay intención
   * de transcribir, así que se cancela: entregar texto de un gesto que el
   * usuario no terminó es peor que perderlo.
   */
  protected onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) {
      return;
    }

    this.releasePointer(event);
    this.dictation?.cancel();
  }

  // --- Teclado --------------------------------------------------------------

  /**
   * El equivalente por teclado del gesto. Un "mantener pulsado" físico no
   * existe para quien navega con teclado o con control por voz, así que aquí
   * el ciclo es: mantener Espacio/Intro graba, soltar transcribe, Escape
   * cancela. Sin esto la funcionalidad de dictado sería inalcanzable sin un
   * puntero, que es un fallo de accesibilidad, no una limitación del gesto.
   */
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.recording()) {
      this.dictation?.cancel();
      return;
    }

    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    // `repeat` es la ráfaga de autorepetición al mantener la tecla: sin la
    // guarda se llamaría a start() decenas de veces por segundo.
    if (event.repeat || this.recording() || this.sending()) {
      return;
    }

    event.preventDefault();
    this.beginDictation();
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if ((event.key === ' ' || event.key === 'Enter') && this.recording()) {
      event.preventDefault();
      this.dictation?.finish();
    }
  }

  // --- Campo de texto -------------------------------------------------------

  protected onDraftInput(value: string): void {
    // Mientras se graba el campo es de solo lectura y lo que muestra es una
    // vista previa, no el borrador. Escribir ahí lo que llega del `ngModel`
    // congelaría la previa dentro del borrador.
    if (!this.recording()) {
      this.draft.set(value);
    }
  }

  /**
   * En un `<textarea>` Intro escribe un salto de línea, así que enviar hay que
   * pedirlo: Intro envía, Mayús+Intro hace el salto. Es la convención de todo
   * chat, y sin ella el botón Enviar sería la única salida.
   */
  protected onFieldKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSubmit();
    }
  }

  // --- Envío ----------------------------------------------------------------

  protected onSubmit(): void {
    const text = this.draft().trim();
    if (!text || this.sending() || this.recording()) {
      return;
    }

    this.send.emit(text);
    this.draft.set('');
  }

  // --- Interno --------------------------------------------------------------

  private beginDictation(): void {
    this.errorMessage.set(null);
    this.dragX.set(0);
    this.willCancel.set(false);
    this.liveText.set('');
    this.transcribed = false;
    this.maxTravel = -1;

    // Un reconocedor nuevo por gesto, y el anterior siempre desmontado: dos
    // instancias vivas compiten por el micrófono y la segunda muere con
    // `InvalidStateError`.
    this.dictation?.dispose();
    this.dictation = createDictation(this.locale, {
      transcript: text => {
        this.appendTranscript(text);
        this.transcribed = true;
      },
      live: text => this.liveText.set(text),
      error: message => this.errorMessage.set(message),
      end: () => this.stopRecordingState()
    });

    if (!this.dictation) {
      return;
    }

    this.recording.set(true);

    // Puede terminar dentro de este mismo start() —contexto inseguro, start()
    // que lanza—, y entonces `end` ya habrá apagado el estado de grabación.
    this.dictation.start();
  }

  /**
   * El texto dictado se **añade** al borrador en vez de reemplazarlo: escribir
   * media frase, dictar el resto y perder lo escrito era el comportamiento
   * anterior.
   */
  private appendTranscript(text: string): void {
    this.draft.update(actual => (actual.trim() ? `${actual.trim()} ${text}` : text));
  }

  private stopRecordingState(): void {
    const enviar = this.transcribed;
    this.transcribed = false;

    this.recording.set(false);
    this.willCancel.set(false);
    this.dragX.set(0);
    // Se limpia siempre, se haya confirmado o no: si se confirmó, el texto ya
    // está en `draft` y dejarla puesta lo duplicaría en pantalla.
    this.liveText.set('');

    // Soltar el botón envía. El paso de "revisar antes de mandar" no
    // desaparece, se mueve: la revisión ocurre DURANTE el gesto, viendo la
    // transcripción en vivo, y deslizar a la papelera es el descarte. Por eso
    // tiene que ir aquí y no en el handler de `transcript`: ahí `recording`
    // todavía está en pie y `onSubmit` se auto-bloquea.
    //
    // Cancelar y los errores no pasan por aquí con `enviar` en true, porque
    // en ninguno de los dos casos llega a haber transcripción. El caso de
    // "no reconoció nada" también cae solo: sin texto no hay bandera.
    if (enviar) {
      this.onSubmit();
    }
  }

  /**
   * Del borde derecho del micrófono al borde derecho del carril: es justo lo
   * que tiene que viajar para acabar sobre la papelera.
   */
  private measureTravel(): number {
    const lane = this.lane()?.nativeElement;
    const mic = this.mic()?.nativeElement;

    if (!lane || !mic) {
      return 0;
    }

    return Math.max(0, lane.getBoundingClientRect().right - mic.getBoundingClientRect().right);
  }

  /**
   * En un contenedor sin ancho medible (una prueba, un panel aún sin pintar)
   * la medida sale 0 y el gesto se quedaría sin recorrido posible. El suelo
   * mantiene la cancelación alcanzable en ese caso.
   */
  private maxTravelOrFallback(): number {
    return this.maxTravel > 0 ? this.maxTravel : MIN_CANCEL_THRESHOLD_PX;
  }

  private resizeField(): void {
    const el = this.field().nativeElement;

    // `auto` primero para que `scrollHeight` mida el contenido y no la altura
    // que le pusimos la vez anterior: sin esto el campo crece pero no vuelve a
    // encoger al borrar texto.
    el.style.height = 'auto';

    // Con el campo vacío se queda en `auto` y no se mide. El `scrollHeight` de
    // un textarea vacío no vale lo mismo en todos los motores: Firefox cuenta
    // la maquetación del placeholder, así que uno que envolviera dejaba la
    // caja de varias líneas de alto sin haber escrito nada. Con `rows="1"`,
    // `auto` ya es exactamente una línea en cualquier navegador.
    if (!this.displayText()) {
      return;
    }

    el.style.height = `${Math.min(el.scrollHeight, MAX_FIELD_HEIGHT_PX)}px`;
  }

  private releasePointer(event: PointerEvent): void {
    this.capturePointer(event, false);
    this.pointerId = null;
  }

  /**
   * `setPointerCapture` lanza `NotFoundError` si el puntero ya dejó de estar
   * activo, y `releasePointerCapture` hace lo propio si nunca se capturó. Son
   * situaciones normales —el sistema se lleva el gesto, el dedo se levanta
   * fuera de la ventana—, no fallos: dejar que la excepción suba abortaría el
   * handler y el estado de grabación se quedaría a medias.
   */
  private capturePointer(event: PointerEvent, capture: boolean): void {
    const target = event.target as HTMLElement;

    try {
      if (capture) {
        target.setPointerCapture?.(event.pointerId);
      } else {
        target.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Sin captura el gesto sigue funcionando mientras el dedo no salga del
      // botón; no hay nada que recuperar aquí.
    }
  }

  private teardown(): void {
    this.dictation?.dispose();
    this.dictation = null;
  }
}
