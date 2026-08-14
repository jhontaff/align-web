import { HttpErrorResponse } from '@angular/common/http';

export function extractErrorMessage(err: HttpErrorResponse): string {
  const body = err.error;

  if (body && typeof body === 'object' && 'message' in body) {
    return body.message as string;
  }

  return 'Ha ocurrido un error inesperado.';
}
