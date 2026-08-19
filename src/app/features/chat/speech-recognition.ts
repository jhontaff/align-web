export interface SpeechRecognitionResultLike {
  0: { transcript: string };
}

export interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
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

export function createSpeechRecognizer(
  onResult: (transcript: string) => void,
  onEnd: () => void
): SpeechRecognitionLike | null {
  const Recognition = getSpeechRecognitionConstructor();

  if (!Recognition) {
    return null;
  }

  const recognition = new Recognition();
  recognition.lang = 'es-ES';
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = event => onResult(event.results[0][0].transcript);
  recognition.onerror = onEnd;
  recognition.onend = onEnd;

  return recognition;
}
