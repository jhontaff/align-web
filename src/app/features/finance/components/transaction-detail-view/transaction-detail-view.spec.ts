import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { TransactionResponse } from '../../models/transaction.model';
import { TransactionDetailView } from './transaction-detail-view';

registerLocaleData(localeEs);

const TX: TransactionResponse = {
  id: 't1',
  type: 'EXPENSE',
  amount: 12.5,
  category: 'FOOD',
  description: null,
  date: '2026-09-10',
  createdAt: '2026-09-10T00:55:00Z',
  updatedAt: '2026-09-10T00:55:00Z'
};

/**
 * Banco de pruebas que reproduce lo que hace `TransactionDetailDialog`: montar
 * la vista con `showDomain` y PROYECTAR las acciones. Sin la proyección no hay
 * cuarto elemento en la cabecera y la colocación de la rejilla no se puede
 * comprobar — que es justo lo que estas pruebas miran.
 */
@Component({
  imports: [TransactionDetailView],
  template: `
    <app-transaction-detail-view [transaction]="tx" [headingLevel]="2" [showDomain]="true">
      <div headerActions class="dialog__actions"><button type="button">x</button></div>
    </app-transaction-detail-view>
  `
})
class Host {
  readonly tx = TX;
}

/**
 * Los dos montajes reales, uno al lado del otro y al MISMO ancho: la burbuja
 * (rótulo + acciones proyectadas) y la ruta (ni lo uno ni lo otro). Sirve para
 * comparar lo que le toca al importe en cada uno — ver la prueba del final.
 *
 * El ancho es el de un panel de diálogo en un móvil de 360px
 * (`100vw - var(--space-8)`), que es donde el reparto aprieta.
 */
@Component({
  imports: [TransactionDetailView],
  template: `
    <div class="burbuja" style="width: 328px">
      <app-transaction-detail-view [transaction]="tx" [headingLevel]="2" [showDomain]="true">
        <div headerActions class="dialog__actions">
          <button type="button" style="width: 40px">a</button>
          <button type="button" style="width: 40px">b</button>
          <button type="button" style="width: 40px">c</button>
        </div>
      </app-transaction-detail-view>
    </div>
    <div class="ruta" style="width: 328px">
      <app-transaction-detail-view [transaction]="tx" />
    </div>
  `
})
class HostComparador {
  readonly tx = TX;
}

describe('TransactionDetailView (cabecera con rótulo)', () => {
  let fixture: ComponentFixture<Host>;
  let header: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: LOCALE_ID, useValue: 'es-ES' }]
    }).compileComponents();

    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    header = fixture.nativeElement.querySelector('.transaction-detail-view__header');
  });

  it('la cabecera es una rejilla de dos columnas cuando hay rótulo', () => {
    expect(header.classList).toContain('transaction-detail-view__header--with-domain');
    expect(getComputedStyle(header).display).toBe('grid');
  });

  /**
   * El importe y el tipo llevan `[class]` además de su `class` estática. Si esa
   * unión no conservara la estática, la clase de layout desaparecería en tiempo
   * de ejecución, `order: 1` no se aplicaría y el tipo subiría a la primera fila
   * junto al rótulo. Es un fallo que ni el build ni el tipado ven.
   */
  it('el importe y el tipo conservan su clase de layout pese al binding [class]', () => {
    expect(fixture.nativeElement.querySelector('.transaction-detail-view__amount')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.transaction-detail-view__badge')).toBeTruthy();
  });

  it('rótulo y acciones comparten la primera fila; importe y tipo la segunda', () => {
    const top = (selector: string) =>
      (fixture.nativeElement.querySelector(selector) as HTMLElement).getBoundingClientRect().top;

    const kicker = top('.transaction-detail-view__domain');
    const actions = top('.dialog__actions');
    const amount = top('.transaction-detail-view__amount');
    const badge = top('.transaction-detail-view__badge');

    // Misma fila = mismo borde superior (con `align-items: center`, dos alturas
    // distintas no coinciden al píxel: se compara contra la altura de la fila).
    expect(Math.abs(kicker - actions)).toBeLessThan(24);
    expect(Math.abs(amount - badge)).toBeLessThan(24);

    // Y la segunda fila va DEBAJO, que es lo que se rompió cuando el importe
    // llevaba `flex-basis: 100%` y empujaba el tipo a una tercera fila.
    expect(amount).toBeGreaterThan(kicker);
  });
});

describe('TransactionDetailView (burbuja frente a ruta, mismo ancho)', () => {
  /**
   * El importe tiene que disponer del MISMO ancho en la burbuja que en la ruta.
   *
   * Es lo que rompe que las dos filas de la rejilla compartan columnas: la
   * columna derecha la dimensiona el elemento más ancho de TODA la columna, y
   * ahí están los tres botones de acción de la fila de arriba. Sin nada que lo
   * evite, el badge "Gasto" hereda el ancho de esos botones y le roba al
   * importe unos 70px que en la ruta sí tiene — justo en el ancho de un móvil,
   * que es donde se nota.
   */
  it('el importe dispone del mismo ancho en los dos montajes', async () => {
    await TestBed.configureTestingModule({ imports: [HostComparador] }).compileComponents();

    const fixture = TestBed.createComponent(HostComparador);
    fixture.detectChanges();

    const anchoDe = (raiz: string) =>
      (fixture.nativeElement.querySelector(
        `${raiz} .transaction-detail-view__amount`
      ) as HTMLElement).getBoundingClientRect().width;

    const burbuja = anchoDe('.burbuja');
    const ruta = anchoDe('.ruta');

    expect(Math.abs(burbuja - ruta))
      .withContext(`burbuja ${burbuja}px vs ruta ${ruta}px`)
      .toBeLessThan(4);
  });
});
