import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatThread } from './chat-thread';
import { ChatMessage } from '../../models/chat.model';

/** Historial largo: sin desbordamiento no hay scroll que probar. */
function historial(n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    text: `mensaje ${i} con texto suficiente para ocupar varias lineas del panel`
  }));
}

describe('ChatThread — seguir el ultimo mensaje', () => {
  let fixture: ComponentFixture<ChatThread>;
  let host: HTMLElement;
  let scrollTo: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChatThread] }).compileComponents();
  });

  async function montar(messages: ChatMessage[]): Promise<void> {
    fixture = TestBed.createComponent(ChatThread);
    fixture.componentRef.setInput('messages', messages);

    host = fixture.nativeElement as HTMLElement;
    // El `:host` es `flex: 1` y en la prueba no hay padre flex que le dé alto.
    host.style.height = '120px';
    host.style.display = 'flex';

    scrollTo = spyOn(host, 'scrollTo');

    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function nuevos(messages: ChatMessage[]): Promise<void> {
    fixture.componentRef.setInput('messages', messages);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /** Simula que el usuario sube a leer hacia atras. */
  async function subirAlPrincipio(): Promise<void> {
    host.scrollTop = 0;
    host.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
  }

  it('al montar con historial se coloca en el ultimo mensaje', async () => {
    await montar(historial(20));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    const args = scrollTo.calls.mostRecent().args[0] as ScrollToOptions;
    expect(args.top).toBe(host.scrollHeight);
  });

  it('la primera colocacion es un salto, no una animacion', async () => {
    await montar(historial(20));

    // Recorrer toda la conversacion animado al abrir se lee como un fallo y
    // obliga a esperar para ver lo ultimo, que es justo a lo que se venia.
    const args = scrollTo.calls.mostRecent().args[0] as ScrollToOptions;
    expect(args.behavior).toBe('auto');
  });

  it('sin mensajes todavia (historial en vuelo) no se toca el scroll', async () => {
    await montar([]);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('un mensaje nuevo, con el usuario abajo, sigue el hilo y lo hace suave', async () => {
    const base = historial(20);
    await montar(base);
    scrollTo.calls.reset();

    await nuevos([...base, { role: 'assistant', text: 'respuesta nueva' }]);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    const args = scrollTo.calls.mostRecent().args[0] as ScrollToOptions;
    expect(args.behavior).toBe('smooth');
  });

  it('un mensaje nuevo NO arrastra al usuario que subio a leer', async () => {
    const base = historial(20);
    await montar(base);
    await subirAlPrincipio();
    scrollTo.calls.reset();

    await nuevos([...base, { role: 'assistant', text: 'respuesta del agente' }]);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('el mensaje propio SI baja, aunque estuviera leyendo hacia atras', async () => {
    const base = historial(20);
    await montar(base);
    await subirAlPrincipio();
    scrollTo.calls.reset();

    // Pulsar Enviar es pedir ver el resultado.
    await nuevos([...base, { role: 'user', text: 'lo que acabo de escribir' }]);

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('la burbuja "Escribiendo..." tambien arrastra la vista', async () => {
    const base = historial(20);
    await montar(base);
    scrollTo.calls.reset();

    fixture.componentRef.setInput('sending', true);
    fixture.detectChanges();
    await fixture.whenStable();

    // Sin esto el indicador aparece fuera de pantalla y el chat parece no
    // haber reaccionado al envio.
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
