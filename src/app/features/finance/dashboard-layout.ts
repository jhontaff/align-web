import { GridsterItem } from 'angular-gridster2';

/**
 * Las cinco tarjetas del panel de Finanzas.
 *
 * Es una unión cerrada y no `string` a propósito: el layout guardado en
 * `localStorage` se valida contra ella, así que renombrar una tarjeta invalida
 * los layouts viejos en vez de dejarlos resucitar una sección que ya no existe.
 */
export type DashboardCardId =
  | 'income'
  | 'expense'
  | 'balance'
  | 'byCategory'
  | 'pace'
  | 'flow'
  | 'recent';

/**
 * El mismo conjunto, iterable. Escrito a mano y no derivado: no hay forma de
 * enumerar los miembros de una unión en tiempo de ejecución. El compilador
 * vigila que no se separen — `defaultLayout()` devuelve un `Record` sobre la
 * unión, así que olvidar una tarjeta ahí es un error de compilación.
 */
export const DASHBOARD_CARD_IDS: readonly DashboardCardId[] = [
  'income',
  'expense',
  'balance',
  'byCategory',
  'pace',
  'flow',
  'recent'
];

/**
 * Una tarjeta colocada en la rejilla.
 *
 * `x`/`y`/`cols`/`rows` **los muta gridster en su sitio** al arrastrar o
 * redimensionar: son mutables por contrato con la librería, no por descuido.
 * `id` y `autoHeight` describen la tarjeta y no su posición, así que van en
 * solo lectura.
 */
export interface DashboardCard extends GridsterItem {
  readonly id: DashboardCardId;

  /**
   * Si el alto lo decide el contenido en vez del usuario.
   *
   * Solo dos tarjetas lo tienen: "Gastos por categoría" (depende de cuántas
   * categorías tuvieron gasto en el periodo) y "Últimos movimientos" (de cero a
   * cinco filas, o un estado vacío más corto). Las otras tres tienen alto
   * determinista —los dos gráficos fijan su área de trazado en 180px— así que
   * su alto es del usuario.
   *
   * **Una tarjeta automática no se redimensiona en vertical**, y no es una
   * limitación arbitraria: si pudiera, el usuario la estiraría, llegarían datos
   * nuevos y el observador la devolvería a su tamaño calculado. Serían dos
   * fuerzas escribiendo el mismo número. Los tiradores se limitan a este/oeste.
   */
  readonly autoHeight: boolean;

  x: number;
  y: number;
  cols: number;
  rows: number;
}

export type DashboardCards = Record<DashboardCardId, DashboardCard>;

/**
 * Doce columnas, como cualquier rejilla de maquetación: divisible entre 2, 3, 4
 * y 6, así que media pantalla, un tercio y un cuarto son todos números enteros.
 */
export const DASHBOARD_COLUMNS = 12;

/**
 * Alto de fila, en píxeles.
 *
 * 48 y no 180 (el área de trazado de los gráficos): es la unidad en la que
 * crece una tarjeta automática, así que una fila grande haría que añadir una
 * categoría al desglose diera un salto de tarjeta entera. Con 48 el área de
 * trazado cae en cuatro filas y el crecimiento se ve continuo.
 */
export const DASHBOARD_ROW_HEIGHT = 48;

/**
 * Separación entre tarjetas, en píxeles.
 *
 * **Duplica a `--space-4`** y no puede leerlo: gridster lo recibe como número
 * en su configuración, no como CSS. Mismo trato que `DESKTOP_BREAKPOINT_PX`
 * frente a `$breakpoint-desktop` — si cambia el token, cambia aquí.
 */
export const DASHBOARD_MARGIN = 16;

/** Ninguna tarjeta baja de aquí, ni siquiera vacía. */
const MIN_ROWS = 3;

/**
 * Cuántas filas hacen falta para un contenido de `height` píxeles.
 *
 * Es la inversa de cómo gridster calcula el alto de un item:
 * `alto = filas * (fila + margen) - margen`.
 */
export function rowsForHeight(height: number): number {
  const unit = DASHBOARD_ROW_HEIGHT + DASHBOARD_MARGIN;
  return Math.max(MIN_ROWS, Math.ceil((height + DASHBOARD_MARGIN) / unit));
}

/**
 * La disposición de partida.
 *
 * Reproduce el orden vertical que la pantalla tenía antes de la rejilla
 * —las cifras, desglose, ritmo, flujo, movimientos— leído en Z: las tres cifras
 * se reparten la fila de arriba a cuatro columnas cada una y el resto va por
 * parejas. Ese orden está argumentado en los comentarios de `overview.html`
 * ("de lo puntual a lo histórico"), y el DOM lo mantiene literalmente, así que
 * por debajo del umbral de escritorio, donde la rejilla se apila, la pantalla
 * queda idéntica a la de siempre.
 *
 * **Ingresos, gastos y balance son tres tarjetas y no una.** Lo eran hasta el
 * 2026-09-05, agrupadas en un `<ul>`, y separarlas es lo que permite moverlas
 * y dimensionarlas por separado — que es para lo que está la rejilla. El precio
 * es que se pueden alejar unas de otras y las tres cifras dejan de compararse
 * de un vistazo; a cambio, la disposición de fábrica las deja juntas y del
 * mismo tamaño, y volver a ella es un botón.
 *
 * Es una función y no una constante porque devuelve objetos mutables: una
 * constante compartida se corrompería en cuanto gridster escribiera en ella, y
 * "Restablecer" dejaría de restablecer nada.
 */
export function defaultLayout(): DashboardCards {
  return {
    income: { id: 'income', autoHeight: false, x: 0, y: 0, cols: 4, rows: 2 },
    expense: { id: 'expense', autoHeight: false, x: 4, y: 0, cols: 4, rows: 2 },
    balance: { id: 'balance', autoHeight: false, x: 8, y: 0, cols: 4, rows: 2 },
    byCategory: { id: 'byCategory', autoHeight: true, x: 0, y: 2, cols: 6, rows: 7 },
    // El ritmo de gasto es la única tarjeta cuyo contenido se reparte el alto de
    // la celda (`dashboard__card--fill`): su gráfico crece con ella. Por eso
    // arranca con una fila más que el resto —para que el trazado nazca con algo
    // más que su alto mínimo— y por eso lleva suelo propio: por debajo de seis
    // filas, el gráfico llega a su tope de encogimiento y lo siguiente en ceder
    // serían las cifras de abajo, que el `overflow: hidden` de la celda cortaría
    // sin avisar.
    pace: { id: 'pace', autoHeight: false, x: 6, y: 2, cols: 6, rows: 8, minItemRows: 6 },
    flow: { id: 'flow', autoHeight: false, x: 0, y: 10, cols: 6, rows: 7 },
    recent: { id: 'recent', autoHeight: true, x: 6, y: 10, cols: 6, rows: 7 }
  };
}

/**
 * Los tiradores de redimensionado de una tarjeta — ver `autoHeight`. Va por
 * item y no en la configuración de la rejilla porque gridster lo lee de ahí.
 */
export function handlesFor(card: DashboardCard): DashboardCard['resizableHandles'] {
  const vertical = !card.autoHeight;
  return {
    e: true,
    w: true,
    n: vertical,
    s: vertical,
    ne: vertical,
    nw: vertical,
    se: vertical,
    sw: vertical
  };
}

const STORAGE_KEY = 'align_finance_layout';

/**
 * Sube cuando cambie la forma de lo guardado. Un layout de una versión anterior
 * se descarta entero en vez de intentar migrarse: son cinco posiciones que el
 * usuario recoloca en diez segundos, y una migración a medias deja tarjetas
 * solapadas que se leen como un fallo de la app.
 */
const LAYOUT_VERSION = 1;

interface StoredCard {
  id: DashboardCardId;
  x: number;
  y: number;
  cols: number;
  rows: number;
}

interface StoredLayout {
  version: number;
  cards: StoredCard[];
}

/**
 * El layout del usuario, o el de fábrica si no hay ninguno o el guardado no
 * cuadra.
 *
 * **Nunca lanza y nunca devuelve algo a medias.** `localStorage` puede fallar
 * entero (modo privado, cookies bloqueadas), traer JSON inválido o traer un
 * layout escrito por una versión anterior de la pantalla. Los tres casos acaban
 * en la disposición de fábrica, que es la única respuesta útil: una rejilla
 * medio poblada sería peor que ninguna.
 */
export function loadLayout(): DashboardCards {
  const cards = defaultLayout();
  const stored = readStored();
  if (!stored) {
    return cards;
  }

  for (const card of stored.cards) {
    const target = cards[card.id];
    target.x = card.x;
    target.y = card.y;
    target.cols = card.cols;
    // El alto de una tarjeta automática NO se restaura: lo decide su contenido,
    // y el de hoy no tiene por qué ser el de cuando se guardó.
    if (!target.autoHeight) {
      target.rows = card.rows;
    }
  }

  return cards;
}

export function saveLayout(cards: DashboardCards): void {
  const payload: StoredLayout = {
    version: LAYOUT_VERSION,
    cards: DASHBOARD_CARD_IDS.map(id => {
      const { x, y, cols, rows } = cards[id];
      return { id, x, y, cols, rows };
    })
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Guardar la disposición es una comodidad, no parte de la función de la
    // pantalla: si el navegador no deja escribir, se pierde al recargar y ya.
  }
}

export function clearLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ver `saveLayout`.
  }
}

function readStored(): StoredLayout | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidLayout(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Valida que lo guardado describa **exactamente** las tarjetas de hoy.
 *
 * No basta con que el JSON parsee: si mañana se añade una tarjeta, un layout
 * viejo dejaría la nueva sin colocar; si se renombra un id, resucitaría una
 * sección que ya no se pinta. Se exige la lista completa y sin sobrantes.
 */
function isValidLayout(value: unknown): value is StoredLayout {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const layout = value as Partial<StoredLayout>;
  if (layout.version !== LAYOUT_VERSION || !Array.isArray(layout.cards)) {
    return false;
  }

  if (layout.cards.length !== DASHBOARD_CARD_IDS.length) {
    return false;
  }

  const seen = new Set<DashboardCardId>();
  for (const card of layout.cards) {
    if (!isValidCard(card) || seen.has(card.id)) {
      return false;
    }
    seen.add(card.id);
  }

  return DASHBOARD_CARD_IDS.every(id => seen.has(id));
}

function isValidCard(value: unknown): value is StoredCard {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const card = value as Partial<StoredCard>;
  return (
    typeof card.id === 'string' &&
    DASHBOARD_CARD_IDS.includes(card.id as DashboardCardId) &&
    isPosition(card.x) &&
    isPosition(card.y) &&
    isSize(card.cols) &&
    isSize(card.rows)
  );
}

function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1;
}
