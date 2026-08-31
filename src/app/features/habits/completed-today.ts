/**
 * APAÑO TEMPORAL. Recuerda en el navegador que hábitos se marcaron HOY.
 *
 * ---------------------------------------------------------------------------
 * BORRAR ESTE ARCHIVO ENTERO cuando `HabitResponse` incluya `completedToday`.
 * ---------------------------------------------------------------------------
 *
 * Por que existe: la tarjeta pinta el check en verde y revela la racha solo si
 * el habito esta hecho hoy, y `HabitResponse` es
 * `{ id, name, currentStreak, createdAt, updatedAt }` — no hay ningun campo que
 * diga si la completacion de hoy ya se registro. Sin memoria de ningun tipo, al
 * recargar la pagina todas las tarjetas volverian a gris aunque estuvieran
 * hechas, o sea la interfaz afirmaria algo falso. Eso es peor que el boton sin
 * estado que habia antes.
 *
 * Por que NO se deduce de `updatedAt`: tambien cambia al renombrar el habito,
 * asi que un rename marcaria el dia como hecho.
 *
 * Lo que este apano NO arregla, y por lo que sigue siendo un apano:
 *
 * - **Es por navegador.** Marcar en el movil no pinta el check en el portatil.
 * - **No es la verdad.** Si alguien registra la completacion por API, aqui no
 *   consta y la tarjeta sale gris.
 * - Borrar los datos del sitio lo olvida.
 *
 * Se acepta porque Align es una herramienta personal de un solo usuario detras
 * de login, el token ya vive en `localStorage` por la misma razon, y el precio
 * de no tenerlo es una pantalla que miente. El arreglo real es **un campo en el
 * backend**, no mas codigo aqui.
 *
 * Modulo utilitario plano —sin DI, sin clase, kebab-case sin sufijo— igual que
 * `core/auth/token-storage.ts`.
 */

const STORAGE_KEY = 'align_habits_completed';

interface StoredCompletions {
  /** El dia al que pertenecen los ids, como cadena opaca. */
  day: string;
  ids: string[];
}

/**
 * Identificador del dia LOCAL.
 *
 * `toDateString()` y no `toISOString()`: el segundo convierte a UTC antes de
 * formatear, asi que a partir de las 19:00 en Colombia devolveria ya el dia
 * siguiente y el check se apagaria solo a media tarde. Es la misma trampa que
 * documenta `toIsoDate()` en Finanzas — no se importa de alli porque seria una
 * dependencia entre features, y duplicar una linea en un archivo condenado a
 * desaparecer es mejor que subir un helper a `core/` para un consumidor
 * temporal.
 *
 * El valor solo se compara consigo mismo, nunca se muestra: que sea el formato
 * ingles de `toDateString()` da igual.
 */
function today(): string {
  return new Date().toDateString();
}

/**
 * Los ids marcados hoy. Devuelve un Set vacio si lo guardado es de otro dia
 * —asi caduca solo, sin ninguna limpieza programada— o si `localStorage` no
 * esta disponible o trae basura.
 */
export function readCompletedToday(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return new Set();
    }

    const stored = JSON.parse(raw) as StoredCompletions;
    if (stored?.day !== today() || !Array.isArray(stored.ids)) {
      return new Set();
    }

    return new Set(stored.ids);
  } catch {
    // JSON corrupto, modo privado de Safari, almacenamiento bloqueado por
    // politica del navegador. Ninguno es motivo para tumbar la pantalla: el
    // peor caso es que los checks salgan grises, que es el estado por defecto.
    return new Set();
  }
}

/** Anade un id al dia de hoy y devuelve el conjunto resultante. */
export function markCompletedToday(id: string): ReadonlySet<string> {
  const ids = new Set(readCompletedToday());
  ids.add(id);

  try {
    // Se reescribe el `day` en cada guardado: es lo que hace que el registro de
    // ayer se pise en vez de acumularse, sin necesidad de purgar nada.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: today(), ids: [...ids] }));
  } catch {
    // Cuota llena o escritura bloqueada. El estado en memoria sigue siendo
    // correcto para esta sesion; solo se pierde al recargar.
  }

  return ids;
}
