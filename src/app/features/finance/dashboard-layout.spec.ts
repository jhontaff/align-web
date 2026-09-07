import {
  DASHBOARD_CARD_IDS,
  DASHBOARD_MOBILE_COLUMNS,
  clearLayout,
  defaultLayout,
  loadLayout,
  saveLayout
} from './dashboard-layout';

describe('dashboard-layout: disposición de escritorio', () => {
  it('reparte las tres cifras en una sola fila a cuatro columnas cada una', () => {
    const cards = defaultLayout('desktop');

    expect(cards.income.y).toBe(cards.expense.y);
    expect(cards.expense.y).toBe(cards.balance.y);
    expect(cards.income.x + cards.income.cols).toBe(cards.expense.x);
    expect(cards.expense.x + cards.expense.cols).toBe(cards.balance.x);
  });

  it('la tarjeta de movimientos es la única de alto automático', () => {
    const cards = defaultLayout('desktop');

    for (const id of DASHBOARD_CARD_IDS) {
      expect(cards[id].autoHeight).withContext(id).toBe(id === 'recent');
    }
  });
});

describe('dashboard-layout: disposición de móvil', () => {
  it('deja todas las tarjetas en una sola columna', () => {
    const cards = defaultLayout('mobile');

    for (const id of DASHBOARD_CARD_IDS) {
      expect(cards[id].x).withContext(id).toBe(0);
      expect(cards[id].cols).withContext(id).toBe(DASHBOARD_MOBILE_COLUMNS);
    }
  });

  it('apila en el mismo orden de lectura que DASHBOARD_CARD_IDS', () => {
    const cards = defaultLayout('mobile');

    let expectedY = 0;
    for (const id of DASHBOARD_CARD_IDS) {
      expect(cards[id].y).withContext(id).toBe(expectedY);
      expectedY += cards[id].rows;
    }
  });

  it('reutiliza el alto de la disposición de escritorio, no lo recalcula', () => {
    const desktop = defaultLayout('desktop');
    const mobile = defaultLayout('mobile');

    for (const id of DASHBOARD_CARD_IDS) {
      expect(mobile[id].rows).withContext(id).toBe(desktop[id].rows);
    }
  });
});

describe('dashboard-layout: persistencia por variante', () => {
  afterEach(() => {
    clearLayout('desktop');
    clearLayout('mobile');
  });

  it('guardar en una variante no toca la otra', () => {
    const desktop = defaultLayout('desktop');
    desktop.pace.x = 0;
    desktop.pace.y = 99;
    saveLayout('desktop', desktop);

    // La móvil, nunca guardada, sigue siendo la de fábrica.
    const mobile = loadLayout('mobile');
    expect(mobile.pace.y).toBe(defaultLayout('mobile').pace.y);

    const reloadedDesktop = loadLayout('desktop');
    expect(reloadedDesktop.pace.y).toBe(99);
  });

  it('un layout guardado con menos tarjetas de las que hay hoy se descarta entero', () => {
    localStorage.setItem(
      'align_finance_layout',
      JSON.stringify({
        version: 1,
        cards: [{ id: 'income', x: 0, y: 0, cols: 4, rows: 2 }]
      })
    );

    const cards = loadLayout('desktop');
    expect(cards).toEqual(defaultLayout('desktop'));
  });

  it('un layout de otra versión se descarta entero', () => {
    localStorage.setItem(
      'align_finance_mobile_layout',
      JSON.stringify({ version: 999, cards: [] })
    );

    const cards = loadLayout('mobile');
    expect(cards).toEqual(defaultLayout('mobile'));
  });
});
