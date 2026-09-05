import { marked } from 'marked';

marked.setOptions({ breaks: true });

/**
 * El agente devuelve `reply` como texto markdown (negrita, listas numeradas y
 * con viñetas), no como HTML. `breaks: true` convierte un salto de línea
 * simple en `<br>` porque el backend no separa párrafos con línea en blanco.
 *
 * Angular sanitiza cualquier string enlazado con `[innerHTML]` antes de
 * insertarlo, así que este HTML no necesita pasar por
 * `DomSanitizer.bypassSecurityTrustHtml` — y no debe, precisamente porque el
 * texto lo genera un LLM y no es una constante compilada.
 */
export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false });
}
