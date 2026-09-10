import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LOCALE_ID } from '@angular/core';
import { TaskResponse } from '../../models/task.model';
import { TaskDetailView } from './task-detail-view';

function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: 't1',
    title: 'Revisar el informe',
    description: null,
    status: 'PENDING',
    priority: 'MEDIUM',
    dueDate: null,
    dueTime: null,
    createdAt: '2026-09-01T15:35:00',
    updatedAt: '2026-09-01T15:35:00',
    ...overrides
  };
}

/** Con acciones proyectadas: lo que monta el cuadro flotante. */
@Component({
  imports: [TaskDetailView],
  template: `
    <app-task-detail-view [task]="task" [headingLevel]="2" titleId="t">
      <div headerActions class="dialog__actions">
        <button type="button" class="btn btn-ghost btn-icon">x</button>
      </div>
    </app-task-detail-view>
  `
})
class ConAcciones {
  readonly task = task();
}

/** Sin proyectar nada: lo que monta la ruta `/tasks/:id`. */
@Component({
  imports: [TaskDetailView],
  template: `<app-task-detail-view [task]="task" />`
})
class SinAcciones {
  readonly task = task();
}

describe('TaskDetailView', () => {
  async function montar<T>(componente: new () => T): Promise<ComponentFixture<T>> {
    // Cada montaje parte de cero: hay pruebas que montan los dos hosts, y
    // `configureTestingModule` lanza si el TestBed ya está inicializado.
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [componente as never],
      providers: [{ provide: LOCALE_ID, useValue: 'es-ES' }]
    }).compileComponents();

    const fixture = TestBed.createComponent(componente);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('A) las acciones proyectadas comparten fila con el título', async () => {
    const fixture = await montar(ConAcciones);
    const host: HTMLElement = fixture.nativeElement;

    const titulo = host.querySelector('.task-detail-view__title') as HTMLElement;
    const acciones = host.querySelector('.dialog__actions') as HTMLElement;
    expect(acciones).withContext('las acciones deben proyectarse dentro de la vista').toBeTruthy();

    // El iframe de Karma mide ~732px, o sea por encima del breakpoint de tablet
    // (640px): esto comprueba la disposición de ESCRITORIO.
    expect(window.innerWidth).toBeGreaterThan(640);

    // "Misma fila" se afirma comparando cajas y no clases: lo que se quiere
    // saber es que el navegador las colocó juntas, no que se escribió el CSS
    // que se pretendía. Sus rangos verticales tienen que solaparse.
    const t = titulo.getBoundingClientRect();
    const a = acciones.getBoundingClientRect();
    expect(a.top).toBeLessThan(t.bottom);
    expect(t.top).toBeLessThan(a.bottom);

    // Y las acciones van a la derecha del título, no encima ni debajo.
    expect(a.left).toBeGreaterThanOrEqual(t.right);
  });

  it('B) las badges van en la misma fila en escritorio, entre el título y las acciones', async () => {
    const fixture = await montar(ConAcciones);
    const host: HTMLElement = fixture.nativeElement;

    const badges = host.querySelector('.task-detail-view__badges') as HTMLElement;
    const acciones = host.querySelector('.dialog__actions') as HTMLElement;

    const b = badges.getBoundingClientRect();
    const a = acciones.getBoundingClientRect();
    expect(a.top).toBeLessThan(b.bottom);
    expect(b.right).toBeLessThanOrEqual(a.left + 1);
  });

  it('C) sin proyectar nada, la cabecera no deja un hueco colgando a la derecha', async () => {
    const fixture = await montar(SinAcciones);
    const host: HTMLElement = fixture.nativeElement;

    const cabecera = host.querySelector('.task-detail-view__header') as HTMLElement;
    const badges = host.querySelector('.task-detail-view__badges') as HTMLElement;

    // Es la regresión que un `<div>` envolviendo al `<ng-content>` habría
    // causado: una caja vacía al final se lleva su `gap` y despega las badges
    // del borde. Sin envoltorio, las badges terminan donde termina la cabecera.
    const c = cabecera.getBoundingClientRect();
    const b = badges.getBoundingClientRect();
    expect(Math.abs(c.right - b.right)).toBeLessThan(2);
  });

  it('D) el nivel del encabezado lo decide quien monta', async () => {
    const conDialogo = await montar(ConAcciones);
    expect(conDialogo.nativeElement.querySelector('h2.task-detail-view__title')).toBeTruthy();
    expect(conDialogo.nativeElement.querySelector('h1.task-detail-view__title')).toBeNull();

    const enRuta = await montar(SinAcciones);
    expect(enRuta.nativeElement.querySelector('h1.task-detail-view__title')).toBeTruthy();
  });

  it('E) una tarea sin vencimiento no pinta la fila, en vez de pintarla vacía', async () => {
    const fixture = await montar(SinAcciones);
    const etiquetas = Array.from(
      fixture.nativeElement.querySelectorAll('.task-detail-view__field dt') as NodeListOf<HTMLElement>
    ).map(dt => dt.textContent?.trim());

    expect(etiquetas).not.toContain('Vencimiento');
    expect(etiquetas).toContain('Creada');
  });
});
