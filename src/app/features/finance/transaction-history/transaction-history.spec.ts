import { DEFAULT_CURRENCY_CODE, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { DataRefreshService } from '../../../core/data/data-refresh.service';
import { Page, Pageable } from '../../../core/models/page.model';
import { TransactionFilter, TransactionResponse } from '../models/transaction.model';
import { TransactionService } from '../transaction.service';
import { TransactionHistory } from './transaction-history';

/**
 * Se replica la configuración regional de `app.config.ts`, y los dos pasos
 * hacen falta:
 *
 * - `LOCALE_ID` solo, sin `registerLocaleData`, hace que `CurrencyPipe` lance
 *   `NG0701: Missing locale data` — Angular únicamente trae `en-US` compilado.
 * - Con `en-US` por defecto, los encabezados dirían "September 2026" y los
 *   importes "$1,234", así que la prueba pasaría mientras la pantalla real
 *   muestra otra cosa.
 */
registerLocaleData(localeEsCo);

const LOCALE = 'es-CO';
const CURRENCY = 'COP';

/** El mismo `PAGE_SIZE` del componente. Duplicado porque allí es privado. */
const PAGE_SIZE = 25;

interface Peticion {
  filter: TransactionFilter | undefined;
  pageable: Pageable | undefined;
}

/**
 * Doble del servicio: registra qué se pidió y devuelve lo que se le programe.
 *
 * Se dobla el servicio y no `HttpClient` porque lo que estas pruebas afirman es
 * el comportamiento de la pantalla —qué pide y cómo agrupa lo que recibe—, no
 * la forma de la URL, que ya es responsabilidad de `TransactionService`.
 */
class TransactionServiceDoble {
  readonly peticiones: Peticion[] = [];
  respuestas: Page<TransactionResponse>[] = [];

  list(filter?: TransactionFilter, pageable?: Pageable): Observable<Page<TransactionResponse>> {
    this.peticiones.push({ filter, pageable });
    return of(this.respuestas.shift() ?? pagina([], { last: true }));
  }
}

function movimiento(id: string, date: string, amount: number, income = false): TransactionResponse {
  return {
    id,
    type: income ? 'INCOME' : 'EXPENSE',
    amount,
    category: income ? 'SALARY' : 'FOOD',
    description: null,
    date,
    createdAt: `${date}T10:00:00`,
    updatedAt: `${date}T10:00:00`
  };
}

function pagina(
  content: TransactionResponse[],
  options: { last: boolean; totalElements?: number }
): Page<TransactionResponse> {
  return {
    content,
    totalElements: options.totalElements ?? content.length,
    totalPages: options.last ? 1 : 2,
    number: 0,
    size: PAGE_SIZE,
    first: true,
    last: options.last
  };
}

describe('TransactionHistory', () => {
  let fixture: ComponentFixture<TransactionHistory>;
  let host: HTMLElement;
  let servicio: TransactionServiceDoble;

  beforeEach(async () => {
    servicio = new TransactionServiceDoble();

    await TestBed.configureTestingModule({
      imports: [TransactionHistory],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: LOCALE },
        { provide: DEFAULT_CURRENCY_CODE, useValue: CURRENCY },
        { provide: TransactionService, useValue: servicio }
      ]
    }).compileComponents();
  });

  async function montar(...respuestas: Page<TransactionResponse>[]): Promise<void> {
    servicio.respuestas = respuestas;
    fixture = TestBed.createComponent(TransactionHistory);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function estabilizar(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function meses(): string[] {
    return [...host.querySelectorAll('.history__month-label')].map(el => el.textContent!.trim());
  }

  function balances(): string[] {
    return [...host.querySelectorAll('.history__month-balance')].map(el =>
      el.textContent!.replace(/\s+/g, ' ').trim()
    );
  }

  function botonCargarMas(): HTMLButtonElement | null {
    return host.querySelector<HTMLButtonElement>('.history__more button');
  }

  // ---------------------------------------------------------------------------

  it('la primera peticion NO lleva filtro de fecha: el historial entero', async () => {
    await montar(pagina([movimiento('1', '2026-09-12', 100)], { last: true }));

    // Es la diferencia deliberada con el resumen, que arranca en el mes en
    // curso. Aqui filtrar de entrada esconderia justo lo que se vino a ver.
    expect(servicio.peticiones[0].filter).toBeUndefined();
    // `date,desc` siempre: sin el, los meses saldrian entrelazados.
    expect(servicio.peticiones[0].pageable).toEqual({ page: 0, size: PAGE_SIZE, sort: 'date,desc' });
  });

  it('agrupa por mes, en el orden en que llegan', async () => {
    await montar(
      pagina(
        [
          movimiento('1', '2026-09-12', 100),
          movimiento('2', '2026-09-03', 50),
          movimiento('3', '2026-08-28', 30)
        ],
        { last: true }
      )
    );

    expect(meses()).toEqual(['Septiembre de 2026', 'Agosto de 2026']);
    expect(host.querySelectorAll('app-transaction-row').length).toBe(3);
  });

  it('el ultimo mes NO muestra balance mientras queden paginas', async () => {
    // Es la regla no obvia de la pantalla: septiembre esta a medias porque la
    // siguiente tanda seguira trayendo movimientos suyos. Un balance ahi seria
    // el de un trozo arbitrario del mes, y cambiaria solo al cargar mas.
    await montar(
      pagina([movimiento('1', '2026-09-12', 100), movimiento('2', '2026-08-28', 30)], {
        last: false,
        totalElements: 40
      })
    );

    expect(meses()).toEqual(['Septiembre de 2026', 'Agosto de 2026']);
    // Solo septiembre, que es el que ya no puede crecer. Agosto, el de cola, no.
    expect(balances().length).toBe(1);
  });

  it('con la lista entera cargada, todos los meses muestran balance', async () => {
    await montar(
      pagina([movimiento('1', '2026-09-12', 100), movimiento('2', '2026-08-28', 30)], {
        last: true
      })
    );

    expect(balances().length).toBe(2);
  });

  it('el balance del mes resta gastos y suma ingresos', async () => {
    await montar(
      pagina([movimiento('1', '2026-09-12', 100, true), movimiento('2', '2026-09-03', 30)], {
        last: true
      })
    );

    // 100 de ingreso menos 30 de gasto. Se comprueba el signo y no el formato
    // exacto, que depende del `DEFAULT_CURRENCY_CODE` de la app.
    expect(balances()[0]).toContain('70');
    expect(balances()[0]).not.toContain('-');
  });

  it('"cargar mas" pide la pagina siguiente y AÑADE, no reemplaza', async () => {
    await montar(
      pagina([movimiento('1', '2026-09-12', 100)], { last: false, totalElements: 2 })
    );

    expect(botonCargarMas()!.textContent).toContain('1 restantes');

    servicio.respuestas = [
      pagina([movimiento('2', '2026-08-28', 30)], { last: true, totalElements: 2 })
    ];
    botonCargarMas()!.click();
    await estabilizar();

    expect(servicio.peticiones[1].pageable).toEqual({ page: 1, size: PAGE_SIZE, sort: 'date,desc' });
    expect(host.querySelectorAll('app-transaction-row').length).toBe(2);
    // Sin mas paginas, el boton desaparece y agosto ya puede mostrar balance.
    expect(botonCargarMas()).toBeNull();
    expect(balances().length).toBe(2);
  });

  it('la revalidacion del agente vuelve a pedir la VENTANA cargada, no la primera pagina', async () => {
    await montar(
      pagina([movimiento('1', '2026-09-12', 100)], { last: false, totalElements: 60 })
    );

    servicio.respuestas = [
      pagina([movimiento('2', '2026-08-28', 30)], { last: false, totalElements: 60 })
    ];
    botonCargarMas()!.click();
    await estabilizar();

    servicio.respuestas = [pagina([movimiento('1', '2026-09-12', 100)], { last: false })];
    TestBed.inject(DataRefreshService).invalidate();
    await estabilizar();

    // Dos paginas cargadas -> una sola peticion por las dos. Devolver al
    // usuario a la primera tanda porque el agente anoto un gasto seria perder
    // todo lo que habia ido bajando.
    expect(servicio.peticiones[2].pageable).toEqual({
      page: 0,
      size: 2 * PAGE_SIZE,
      sort: 'date,desc'
    });
  });
});
