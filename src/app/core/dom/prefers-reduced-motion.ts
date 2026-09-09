/**
 * Si el usuario pidió menos movimiento, para decisiones que toma JavaScript
 * (`scrollIntoView`, `scrollTo`) — el `@media (prefers-reduced-motion)` de CSS
 * no alcanza ahí, hace falta preguntarle al `matchMedia` directamente.
 *
 * Sube a `core/` en su segundo consumidor real (`calendar-widget`, que decide
 * si desplazarse suave o en seco al abrir un panel) — vivía como función
 * privada en `chat-thread.ts`, mismo criterio que ya subió `weekdayLabels`.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
