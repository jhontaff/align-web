import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page } from '../../core/models/page.model';
import { TaskRequest, TaskResponse } from './models/task.model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  list(): Observable<Page<TaskResponse>> {
    return this.http.get<Page<TaskResponse>>('/api/tasks');
  }

  create(request: TaskRequest): Observable<TaskResponse> {
    return this.http.post<TaskResponse>('/api/tasks', request);
  }
}
