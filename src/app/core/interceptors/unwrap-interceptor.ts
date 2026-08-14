import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';

function isApiResponse(body: unknown): body is ApiResponse<unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    'status' in body &&
    'timestamp' in body &&
    'data' in body
  );
}

export const unwrapInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    map(event => {
      if (event instanceof HttpResponse && isApiResponse(event.body)) {
        return event.clone({ body: event.body.data });
      }
      return event;
    })
  );
};
