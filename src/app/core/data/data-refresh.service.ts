import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Aviso de "los datos del servidor pueden haber cambiado por fuera de esta
 * pantalla, revalida lo que tengas cargado".
 *
 * Existe por el agente: `POST /api/agent/chat` puede crear o modificar tareas y
 * transacciones como efecto secundario, pero devuelve `{ reply: string }` —
 * prosa, no un parte de cambios. El frontend no tiene forma de saber **qué**
 * tocó, así que lo único honesto es invalidar y dejar que cada pantalla montada
 * vuelva a pedir lo suyo.
 *
 * Vive en `core/` y no en `features/chat/` porque quien emite (el chat) y
 * quienes escuchan (Tareas, y mañana Finanzas) son features distintas, y las
 * features no se importan entre sí. `core/` es el único sitio donde ese
 * contrato puede vivir sin crear una dependencia cruzada.
 *
 * Es un `Subject<void>` y no un `signal` contador a propósito: esto es un
 * **evento**, no un valor. Un contador obligaría a cada consumidor a montar un
 * `effect()` para reaccionar al cambio y disparar una petición — justo el uso
 * de `effect` que las convenciones del proyecto descartan. Con un stream, el
 * consumidor se suscribe igual que ya se suscribe a `TaskService`.
 */
@Injectable({ providedIn: 'root' })
export class DataRefreshService {
  private readonly _changes = new Subject<void>();

  /** Emite cada vez que algo pudo cambiar en el servidor. */
  readonly changes: Observable<void> = this._changes.asObservable();

  invalidate(): void {
    this._changes.next();
  }
}
