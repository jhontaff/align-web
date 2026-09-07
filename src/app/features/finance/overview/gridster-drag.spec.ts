import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  CompactType,
  DisplayGrid,
  GridType,
  GridsterComponent,
  GridsterConfig,
  GridsterItemComponent
} from 'angular-gridster2';

/**
 * Estas pruebas existen por un fallo concreto: **las tarjetas no se dejaban
 * mover**, y ni el build ni el tipado decían nada.
 *
 * La causa era que gridster decidía por su cuenta si estaba en "modo móvil"
 * comparando `mobileBreakpoint` contra un ancho que medía él —con
 * `useBodyForBreakpoint` eso es `document.body.clientWidth`, que EXCLUYE la
 * barra de scroll, mientras la media query de CSS compara contra el viewport,
 * que la INCLUYE—, y en modo móvil `canBeDragged()` devuelve `false` pase lo que
 * pase. Resultado: el CSS pintaba el escritorio con su botón de "Personalizar" y
 * el arrastre estaba muerto, sin ningún aviso.
 *
 * Lo que se fija aquí no es la implementación de `Overview` sino **el contrato
 * con la librería**: con esta configuración, pulsar y mover sobre una tarjeta
 * tiene que iniciar un arrastre. Por eso el banco de pruebas es un componente
 * mínimo y no la pantalla real: si mañana cambia una opción de gridster y el
 * arrastre se rompe otra vez, esto falla sin depender de servicios, rutas ni
 * peticiones.
 *
 * El ancho del iframe de Karma (~732px) es además el escenario exacto que
 * destapó el fallo: bastaba una ventana estrecha para que gridster se creyera
 * móvil.
 */
@Component({
  selector: 'app-drag-harness',
  imports: [GridsterComponent, GridsterItemComponent],
  template: `
    <gridster class="dashboard" [options]="options">
      <gridster-item class="dashboard__cell" [item]="card">
        <section class="card metric">
          <h2>Ingresos</h2>
          <a class="dashboard__no-drag" href="#">Ver todo</a>
        </section>
      </gridster-item>
    </gridster>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class DragHarness {
  card = { id: 'income', x: 0, y: 0, cols: 4, rows: 2 };

  /** La misma configuración que `Overview.gridOptions`, en lo que importa aquí. */
  readonly options: GridsterConfig = {
    gridType: GridType.VerticalFixed,
    fixedRowHeight: 48,
    setGridSize: true,
    margin: 16,
    outerMargin: false,
    minCols: 12,
    maxCols: 12,
    minItemRows: 2,
    compactType: CompactType.CompactUp,
    pushItems: true,
    // Los centinelas: el umbral no se compara contra ningún ancho medido por
    // gridster. 0 = nunca móvil. En la pantalla real lo escribe un `effect` a
    // partir de `BreakpointService`.
    useBodyForBreakpoint: false,
    mobileBreakpoint: 0,
    displayGrid: DisplayGrid.None,
    draggable: { enabled: false, ignoreContent: false, ignoreContentClass: 'dashboard__no-drag' },
    resizable: { enabled: false }
  };

  /** Réplica de `Overview.toggleEditing()`. */
  enableEditing(): void {
    this.options.draggable = { ...this.options.draggable, enabled: true };
    this.options.resizable = { ...this.options.resizable, enabled: true };
    this.options.api?.optionsChanged?.();
  }
}

describe('rejilla de Finanzas: arrastre', () => {
  let fixture: ComponentFixture<DragHarness>;
  let host: DragHarness;
  let grid: GridsterComponent;
  let item: GridsterItemComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DragHarness] }).compileComponents();
    fixture = TestBed.createComponent(DragHarness);
    host = fixture.componentInstance;
    fixture.detectChanges();

    grid = fixture.debugElement.query(By.directive(GridsterComponent)).componentInstance;
    item = fixture.debugElement.query(By.directive(GridsterItemComponent)).componentInstance;
  });

  /** Suelta el ratón: si el arrastre queda vivo, el teardown revienta. */
  function releasePointer(): void {
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    fixture.detectChanges();
  }

  it('la rejilla NO se cree móvil aunque la ventana sea estrecha', () => {
    // Es la afirmación central: con los centinelas, el ancho medido da igual.
    expect(document.body.clientWidth).toBeLessThan(1024);
    expect(grid.mobile).toBe(false);
  });

  it('publica la api que hace falta para cambiar opciones en caliente', () => {
    // Sin `api`, `toggleEditing()` mutaría el objeto y no pasaría nada: gridster
    // no relee las opciones por su cuenta al mutarlas en sitio.
    expect(host.options.api?.optionsChanged).toEqual(jasmine.any(Function));
  });

  it('con el modo edición apagado, la tarjeta no se puede arrastrar', () => {
    expect(item.canBeDragged()).toBe(false);
  });

  it('al encender el modo edición la tarjeta ya se puede arrastrar', () => {
    host.enableEditing();
    fixture.detectChanges();

    expect(grid.$options.draggable.enabled).toBe(true);
    expect(item.canBeDragged()).toBe(true);
  });

  it('el arrastre arranca desde el CUERPO de la tarjeta, no desde un tirador', () => {
    host.enableEditing();
    fixture.detectChanges();

    const body: HTMLElement = fixture.nativeElement.querySelector('.metric');
    body.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10, button: 0 })
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 200 })
    );

    expect(grid.dragInProgress).withContext('el arrastre arrancó').toBe(true);
    releasePointer();
  });

  it('lo marcado como `dashboard__no-drag` sigue siendo pulsable', () => {
    host.enableEditing();
    fixture.detectChanges();

    const link: HTMLElement = fixture.nativeElement.querySelector('.dashboard__no-drag');
    link.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10, button: 0 })
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 200 })
    );

    expect(grid.dragInProgress)
      .withContext('un enlace no debe convertirse en arrastre')
      .toBeFalsy();
    releasePointer();
  });
});

/**
 * El segundo fallo que este archivo protege: el móvil (2026-09-05) dejó de
 * apilar por CSS y pasó a ser gridster de verdad, con una sola columna
 * (`minCols`/`maxCols = 1`) en vez de doce, precisamente para poder
 * personalizar (arrastrar para reordenar) también ahí. Si alguien reintrodujera
 * `mobileBreakpoint` como forma de detectar pantallas estrechas, el modo
 * `.mobile` de gridster volvería a apagar `canBeDragged()` sin excepción y el
 * arrastre en el teléfono se rompería exactamente igual que se rompía antes en
 * escritorio — mismo mecanismo, otro disparador.
 *
 * Se prueba con una rejilla de UNA columna y no de doce para que la prueba
 * falle si algún día vuelve a depender de `mobileBreakpoint` en vez de
 * `minCols`/`maxCols`.
 */
@Component({
  selector: 'app-single-column-drag-harness',
  imports: [GridsterComponent, GridsterItemComponent],
  template: `
    <gridster class="dashboard" [options]="options">
      <gridster-item class="dashboard__cell" [item]="first">
        <section class="card metric"><h2>Ingresos</h2></section>
      </gridster-item>
      <gridster-item class="dashboard__cell" [item]="second">
        <section class="card metric"><h2>Gastos</h2></section>
      </gridster-item>
    </gridster>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class SingleColumnDragHarness {
  first = { id: 'income', x: 0, y: 0, cols: 1, rows: 2 };
  second = { id: 'expense', x: 0, y: 2, cols: 1, rows: 2 };

  /** La misma configuración que `Overview.gridOptions` con una sola columna. */
  readonly options: GridsterConfig = {
    gridType: GridType.VerticalFixed,
    fixedRowHeight: 48,
    setGridSize: true,
    margin: 16,
    outerMargin: false,
    minCols: 1,
    maxCols: 1,
    minItemRows: 2,
    compactType: CompactType.CompactUp,
    pushItems: true,
    useBodyForBreakpoint: false,
    mobileBreakpoint: 0,
    displayGrid: DisplayGrid.None,
    draggable: { enabled: false, ignoreContent: false, ignoreContentClass: 'dashboard__no-drag' },
    // Réplica de `Overview.applyColumnLayout()`: en una sola columna el
    // redimensionado se queda apagado aunque se edite; solo se arrastra.
    resizable: { enabled: false }
  };

  enableEditing(): void {
    this.options.draggable = { ...this.options.draggable, enabled: true };
    this.options.api?.optionsChanged?.();
  }
}

describe('rejilla de Finanzas: arrastre en una sola columna (móvil)', () => {
  let fixture: ComponentFixture<SingleColumnDragHarness>;
  let host: SingleColumnDragHarness;
  let grid: GridsterComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SingleColumnDragHarness] }).compileComponents();
    fixture = TestBed.createComponent(SingleColumnDragHarness);
    host = fixture.componentInstance;
    fixture.detectChanges();
    grid = fixture.debugElement.query(By.directive(GridsterComponent)).componentInstance;
  });

  function releasePointer(): void {
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    fixture.detectChanges();
  }

  it('una sola columna no activa el modo móvil de gridster', () => {
    expect(grid.columns).toBe(1);
    expect(grid.mobile).toBe(false);
  });

  it('las dos tarjetas se pueden arrastrar igual que con doce columnas', () => {
    host.enableEditing();
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.directive(GridsterItemComponent));
    for (const debugItem of items) {
      const component: GridsterItemComponent = debugItem.componentInstance;
      expect(component.canBeDragged()).withContext(component.item['id']).toBe(true);
    }
  });

  it('arrastrar la primera tarjeta arranca un arrastre real', () => {
    host.enableEditing();
    fixture.detectChanges();

    const body: HTMLElement = fixture.nativeElement.querySelector('.metric');
    body.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10, button: 0 })
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 200 })
    );

    expect(grid.dragInProgress).toBe(true);
    releasePointer();
  });
});
