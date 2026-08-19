import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TaskService } from '../task.service';
import { TaskResponse } from '../models/task.model';

@Component({
  selector: 'app-task-list',
  imports: [RouterLink],
  templateUrl: './task-list.html',
  styleUrl: './task-list.scss'
})
export class TaskList implements OnInit {
  private readonly taskService = inject(TaskService);

  protected readonly tasks = signal<TaskResponse[]>([]);
  protected readonly loading = signal(true);

  private readonly statusLabels: Record<TaskResponse['status'], string> = {
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En progreso',
    COMPLETED: 'Completada'
  };

  private readonly priorityLabels: Record<TaskResponse['priority'], string> = {
    LOW: 'Baja',
    MEDIUM: 'Media',
    HIGH: 'Alta'
  };

  ngOnInit(): void {
    this.taskService.list().subscribe(page => {
      this.tasks.set(page.content);
      this.loading.set(false);
    });
  }

  protected statusLabel(status: TaskResponse['status']): string {
    return this.statusLabels[status];
  }

  protected priorityLabel(priority: TaskResponse['priority']): string {
    return this.priorityLabels[priority];
  }

    protected dueLabel(task: TaskResponse): string | null {
    if (!task.dueDate) {
      return null;
    }

    const date = new Date(`${task.dueDate}T00:00:00`);
    const formatted = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

    if (!task.dueTime) {
      return formatted;
    }

    return `${formatted} · ${task.dueTime.slice(0, 5)}`;
  }

}
