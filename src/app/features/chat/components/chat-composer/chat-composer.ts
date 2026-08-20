import { ChangeDetectionStrategy, Component, OnDestroy, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SpeechRecognitionLike,
  createSpeechRecognizer,
  isSpeechRecognitionSupported
} from '../../speech-recognition';

/**
 * El campo de texto, el botón de dictado y el envío. Dueño del borrador y de
 * nada más: emite el texto y deja que el montaje decida qué hacer con él.
 */
@Component({
  selector: 'app-chat-composer',
  imports: [FormsModule],
  templateUrl: './chat-composer.html',
  styleUrl: './chat-composer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComposer implements OnDestroy {
  readonly sending = input(false);
  readonly send = output<string>();

  private recognition: SpeechRecognitionLike | null = null;

  // Signal y no propiedad plana porque el dictado lo escribe desde el callback
  // de SpeechRecognition, que no es un evento de plantilla: con OnPush una
  // propiedad plana dejaría de repintarse al dictar.
  protected readonly draft = signal('');
  protected readonly listening = signal(false);

  // No es signal: el soporte del navegador no cambia durante la sesión.
  protected readonly voiceSupported = isSpeechRecognitionSupported();

  ngOnDestroy(): void {
    this.recognition?.stop();
  }

  protected toggleListening(): void {
    if (this.listening()) {
      this.recognition?.stop();
      return;
    }

    this.recognition = createSpeechRecognizer(
      transcript => this.draft.set(transcript),
      () => this.listening.set(false)
    );

    if (!this.recognition) {
      return;
    }

    this.listening.set(true);
    this.recognition.start();
  }

  protected onSubmit(): void {
    const text = this.draft().trim();
    if (!text || this.sending()) {
      return;
    }

    this.send.emit(text);
    this.draft.set('');
  }
}
