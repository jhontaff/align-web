import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TaskService } from '../task.service';
import { TaskResponse } from '../models/task.model';

@Component({
  selector: 'app-task-list',
  imports: [RouterLink],
  templateUrl: './task-list.html'
})
export class TaskList implements OnInit {
  private readonly taskService = inject(TaskService);

  protected readonly tasks = signal<TaskResponse[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.taskService.list().subscribe(page => {
      this.tasks.set(page.content);
      this.loading.set(false);
    });
  }
}
