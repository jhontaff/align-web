import { HttpErrorResponse } from '@angular/common/http';

/**
 * Normaliza un error HTTP en algo que se le pueda enseñar al usuario.
 *
 * No decide presentación (toast, error inline, silencio): eso es del llamante,
 * que es el único que sabe si ese fallo debe interrumpir o fallar callado.
 */
export function extractErrorMessage(err: HttpErrorResponse): string {
  const body: unknown = err.error;

  // `status === 0` es red caída o timeout: no hay body y no tiene sentido buscar dentro.
  if (!body || typeof body !== 'object') {
    return 'Ha ocurrido un error inesperado.';
  }

  const { message, errors } = body as { message?: unknown; errors?: unknown };

  // Bean Validation manda el detalle por campo y deja `message` en "Validation failed.",
  // que no le dice al usuario qué corregir. El detalle gana cuando existe.
  if (errors && typeof errors === 'object') {
    const details = Object.values(errors as Record<string, unknown>)
      .filter((detail): detail is string => typeof detail === 'string' && detail.length > 0);

    if (details.length > 0) {
      return details.join(' ');
    }
  }

  if (typeof message === 'string' && message.length > 0) {
    return message;
  }

  return 'Ha ocurrido un error inesperado.';
}
