import { GridsterItem } from 'angular-gridster2';

/**
 * Las siete tarjetas del panel de Finanzas.
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
 * vigila que no se separen — `desktopDefaultLayout()` devuelve un `Record`
 * sobre la unión, así que olvidar una tarjeta ahí es un error de compilación.
 *
 * El orden de este array **es** el orden de lectura: encabeza la disposición
 * de escritorio (leída en Z) y es literalmente la disposición de móvil, donde
 * cada tarjeta se apila sobre la anterior en este mismo orden. Ver
 * `mobileDefaultLayout()`.
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
   * Solo una tarjeta lo tiene: "Últimos movimientos" (de cero a cinco filas, o
   * un estado vacío más corto, según el periodo). Las otras seis tienen alto
   * determinista y su alto es del usuario — las tres cifras porque su
   * contenido es una línea, y "Gastos por categoría" / "Ritmo de gasto" /
   * "Flujo de los últimos meses" porque su gráfico se reparte el alto de la
   * celda en vez de imponerlo (`.dashboard__card--fill` en `overview.scss`).
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
 * Doce columnas en escritorio, como cualquier rejilla de maquetación: divisible
 * entre 2, 3, 4 y 6, así que media pantalla, un tercio y un cuarto son todos
 * números enteros.
 */
export const DASHBOARD_COLUMNS = 12;

/**
 * Una columna en móvil.
 *
 * No es una rejilla degenerada: sigue siendo gridster de verdad —con
 * `minCols`/`maxCols` en 1 en vez de doce—, no la pila por CSS que había antes
 * del 2026-09-05. Es lo que hace posible personalizar (arrastrar para
 * reordenar) también en el teléfono, ver `Overview.applyColumnLayout()`.
 */
export const DASHBOARD_MOBILE_COLUMNS = 1;

/**
 * Alto de fila, en píxeles.
 *
 * 48 y no 180 (el área de trazado de los gráficos): es la unidad en la que
 * crece la tarjeta automática, así que una fila grande haría que añadir un
 * movimiento reciente diera un salto de tarjeta entera. Con 48 el área de
 * trazado de un gráfico cae en cuatro filas y el crecimiento se ve continuo.
 *
 * No depende del número de columnas: una fila mide lo mismo en la rejilla de
 * doce columnas del escritorio que en la de una columna del móvil, que es lo
 * que permite que `mobileDefaultLayout()` reutilice el `rows` de la disposición
 * de escritorio sin recalcular nada.
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
 * La disposición de partida, en escritorio o en móvil.
 *
 * **Son dos disposiciones distintas y no la misma reescalada**, porque doce
 * columnas y una columna no son la misma pregunta: en escritorio hay que
 * decidir qué va al lado de qué, y en móvil solo en qué orden se apila. Cada
 * una tiene su propio guardado en `localStorage` — ver
 * `Overview.applyColumnLayout()`, que es quien elige cuál aplicar según el
 * ancho de la ventana.
 *
 * Es una función y no una constante porque devuelve objetos mutables: una
 * constante compartida se corrompería en cuanto gridster escribiera en ella, y
 * "Restablecer" dejaría de restablecer nada.
 */
export function defaultLayout(variant: DashboardLayoutVariant): DashboardCards {
  return variant === 'desktop' ? desktopDefaultLayout() : mobileDefaultLayout();
}

/**
 * La disposición de escritorio: doce columnas.
 *
 * Reproduce el orden vertical que la pantalla tenía antes de la rejilla
 * —las cifras, desglose, ritmo, flujo, movimientos— leído en Z: las tres cifras
 * se reparten la fila de arriba a cuatro columnas cada una y el resto va por
 * parejas. Ese orden está argumentado en los comentarios de `overview.html`
 * ("de lo puntual a lo histórico").
 *
 * **Ingresos, gastos y balance son tres tarjetas y no una.** Lo eran hasta el
 * 2026-09-05, agrupadas en un `<ul>`, y separarlas es lo que permite moverlas
 * y dimensionarlas por separado — que es para lo que está la rejilla. El precio
 * es que se pueden alejar unas de otras y las tres cifras dejan de compararse
 * de un vistazo; a cambio, la disposición de fábrica las deja juntas y del
 * mismo tamaño, y volver a ella es un botón.
 *
 * **"Gastos por categoría" pasó de alto automático a `--fill` el 2026-09-05**,
 * junto con "Ritmo de gasto" y "Flujo de los últimos meses": las tres son ahora
 * tarjetas de tamaño fijo y redimensionable cuyo gráfico se reparte el alto de
 * la celda, en vez de que el número de categorías del periodo decida el alto de
 * la tarjeta. El `minItemRows` de cada una es el punto en el que su gráfico
 * llega a su suelo de legibilidad — por debajo, lo siguiente en ceder sería
 * contenido que el `overflow: hidden` de la celda cortaría sin avisar.
 */
function desktopDefaultLayout(): DashboardCards {
  return {
    income: { id: 'income', autoHeight: false, x: 0, y: 0, cols: 4, rows: 2 },
    expense: { id: 'expense', autoHeight: false, x: 4, y: 0, cols: 4, rows: 2 },
    balance: { id: 'balance', autoHeight: false, x: 8, y: 0, cols: 4, rows: 2 },
    byCategory: {
      id: 'byCategory',
      autoHeight: false,
      x: 0,
      y: 2,
      cols: 6,
      rows: 7,
      minItemRows: 6
    },
    pace: { id: 'pace', autoHeight: false, x: 6, y: 2, cols: 6, rows: 8, minItemRows: 6 },
    flow: { id: 'flow', autoHeight: false, x: 0, y: 10, cols: 6, rows: 7, minItemRows: 6 },
    recent: { id: 'recent', autoHeight: true, x: 6, y: 10, cols: 6, rows: 7 }
  };
}

/**
 * La disposición de móvil: una columna.
 *
 * Reutiliza el `rows` de la disposición de escritorio — el alto de fila no
 * depende del ancho de columna, así que una tarjeta de 7 filas mide lo mismo
 * en una columna que en dos — y solo cambia `x` (siempre 0), `cols` (siempre 1)
 * e `y`, que es la suma acumulada de lo que va antes en `DASHBOARD_CARD_IDS`.
 * El resultado es el mismo orden de lectura que tenía la pantalla antes de la
 * rejilla, ahora colocado por gridster de verdad y no por una pila de CSS —
 * que es lo que hace falta para que arrastrar y reordenar funcione también
 * aquí.
 */
function mobileDefaultLayout(): DashboardCards {
  const cards = desktopDefaultLayout();

  let y = 0;
  for (const id of DASHBOARD_CARD_IDS) {
    const card = cards[id];
    card.x = 0;
    card.cols = DASHBOARD_MOBILE_COLUMNS;
    card.y = y;
    y += card.rows;
  }

  return cards;
}

/**
 * Los tiradores de redimensionado de una tarjeta — ver `autoHeight`. Va por
 * item y no en la configuración de la rejilla porque gridster lo lee de ahí.
 *
 * En móvil no hace falta una variante propia: `Overview.applyColumnLayout()`
 * apaga `resizable` para toda la rejilla —una columna no tiene ancho que
 * repartir, y estirar en vertical ahí es "personalizar", no "redimensionar"—,
 * así que estos tiradores simplemente no se activan nunca, sea cual sea su
 * configuración.
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

/**
 * Escritorio y móvil son dos disposiciones independientes, con su propio
 * guardado. Mover las tarjetas en el teléfono no debe tocar lo que el usuario
 * ya colocó en la pantalla grande, ni al revés — son dos preguntas distintas
 * ("qué va al lado de qué" contra "en qué orden se apila").
 */
export type DashboardLayoutVariant = 'desktop' | 'mobile';

const STORAGE_KEYS: Record<DashboardLayoutVariant, string> = {
  desktop: 'align_finance_layout',
  mobile: 'align_finance_mobile_layout'
};

/**
 * Sube cuando cambie la forma de lo guardado. Un layout de una versión anterior
 * se descarta entero en vez de intentar migrarse: son pocas tarjetas que el
 * usuario recoloca en diez segundos, y una migración a medias deja tarjetas
 * solapadas que se leen como un fallo de la app. Compartida por las dos
 * variantes porque las dos guardan la misma forma de dato.
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
 * El layout del usuario para esa variante, o el de fábrica si no hay ninguno o
 * el guardado no cuadra.
 *
 * **Nunca lanza y nunca devuelve algo a medias.** `localStorage` puede fallar
 * entero (modo privado, cookies bloqueadas), traer JSON inválido o traer un
 * layout escrito por una versión anterior de la pantalla. Los tres casos acaban
 * en la disposición de fábrica de esa variante, que es la única respuesta útil:
 * una rejilla medio poblada sería peor que ninguna.
 */
export function loadLayout(variant: DashboardLayoutVariant): DashboardCards {
  const cards = defaultLayout(variant);
  const stored = readStored(variant);
  if (!stored) {
    return cards;
  }

  for (const card of stored.cards) {
    const target = cards[card.id];
    target.x = card.x;
    target.y = card.y;
    target.cols = card.cols;
    // El alto de la tarjeta automática NO se restaura: lo decide su contenido,
    // y el de hoy no tiene por qué ser el de cuando se guardó.
    if (!target.autoHeight) {
      target.rows = card.rows;
    }
  }

  return cards;
}

export function saveLayout(variant: DashboardLayoutVariant, cards: DashboardCards): void {
  const payload: StoredLayout = {
    version: LAYOUT_VERSION,
    cards: DASHBOARD_CARD_IDS.map(id => {
      const { x, y, cols, rows } = cards[id];
      return { id, x, y, cols, rows };
    })
  };

  try {
    localStorage.setItem(STORAGE_KEYS[variant], JSON.stringify(payload));
  } catch {
    // Guardar la disposición es una comodidad, no parte de la función de la
    // pantalla: si el navegador no deja escribir, se pierde al recargar y ya.
  }
}

export function clearLayout(variant: DashboardLayoutVariant): void {
  try {
    localStorage.removeItem(STORAGE_KEYS[variant]);
  } catch {
    // Ver `saveLayout`.
  }
}

function readStored(variant: DashboardLayoutVariant): StoredLayout | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEYS[variant]);
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
 * sección que ya no se pinta. Se exige la lista completa y sin sobrantes. La
 * misma validación sirve para las dos variantes: la forma de lo guardado es
 * idéntica, solo cambia bajo qué clave vive.
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
