import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../../shared/ui/icon/icon';
import { TaskResponse } from '../../models/task.model';
import { TaskService } from '../../task.service';
import { TaskDetailView } from '../task-detail-view/task-detail-view';

/** Mismo motivo que en `event-detail`/`confirm-dialog`: `id` es global al documento. */
let nextId = 0;

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; task: TaskResponse };

/**
 * Una tarea como cuadro flotante, para abrirla sin salir de Inicio. Gemelo de `EventDetail`.
 * Comparte el cuerpo con la ruta (`TaskDetailView`) pero no la chrome: allí `.page`, aquí una X.
 * La petición y el borrado sí se repiten: hacen cosas distintas al terminar y el id llega de otro sitio.
 * Sin `open` del padre: el widget lo monta con `@if`, así que existir ya significa estar abierto.
 */
@Component({
  selector: 'app-task-detail-dialog',
  imports: [ConfirmDialog, Icon, TaskDetailView],
  templateUrl: './task-detail-dialog.html',
  styleUrl: './task-detail-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetailDialog {
  private readonly tasks = inject(TaskService);

  private readonly id = nextId++;
  protected readonly titleId = `task-detail-dialog-title-${this.id}`;

  // Opcional a propósito: el efecto de abajo puede correr antes de que la vista exista.
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  readonly taskId = input.required<string>();

  /** Pide editar esta tarea — el padre decide qué mostrar a continuación. */
  readonly edit = output<TaskResponse>();

  /** Se borró con éxito. Sin ruta a la que navegar: el padre cierra y refresca. */
  readonly deleted = output<string>();

  /** Cerrar sin editar ni borrar. */
  readonly close = output<void>();

  // `toObservable` sobre el input y no `ActivatedRoute`: aquí no hay ruta de la que leer el id.
  private readonly id$ = toObservable(this.taskId).pipe(distinctUntilChanged());

  private readonly state = toSignal(
    this.id$.pipe(
      switchMap(id =>
        this.tasks.get(id).pipe(
          map((task): DetailState => ({ status: 'ready', task })),
          catchError(err => of<DetailState>({ status: 'error', message: extractErrorMessage(err) })),
          startWith<DetailState>({ status: 'loading' })
        )
      )
    ),
    { initialValue: { status: 'loading' } as DetailState }
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : null;
  });

  protected readonly task = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.task : null;
  });

  /** Aparte de `state` porque ese stream no es escribible. */
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly confirmOpen = signal(false);

  protected readonly confirmMessage = computed(() => {
    const task = this.task();
    return task ? `Se eliminará "${task.title}" de forma permanente.` : '';
  });

  constructor() {
    // `afterRenderEffect` y no `effect`: `showModal()` necesita el elemento ya pintado.
    // El guard contra `el.open` evita el `InvalidStateError` de llamarlo dos veces.
    afterRenderEffect(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
    });
  }

  /** El evento `close` nativo cubre Escape y el clic fuera; la X cae en el mismo sitio. */
  protected onNativeClose(): void {
    this.close.emit();
  }

  /** Un clic en el velo llega con el `<dialog>` como `target`; solo funciona si no tiene `padding`. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.dialog()?.nativeElement.close();
    }
  }

  protected onCloseClick(): void {
    this.dialog()?.nativeElement.close();
  }

  protected onDeleteClick(): void {
    this.confirmOpen.set(true);
  }

  protected onConfirmDelete(): void {
    const task = this.task();
    if (!task) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set(null);

    this.tasks.remove(task.id).subscribe({
      next: () => this.deleted.emit(task.id),
      error: err => {
        this.deleting.set(false);
        this.deleteError.set(extractErrorMessage(err));
      }
    });
  }

  protected onEditClick(): void {
    const task = this.task();
    if (task) {
      this.edit.emit(task);
    }
  }
}
