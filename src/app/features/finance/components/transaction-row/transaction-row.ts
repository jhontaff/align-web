import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { parseIsoDate } from '../../../../core/date/date-range';
import { MONEY_DIGITS } from '../../money';
import { TransactionResponse } from '../../models/transaction.model';
import { CATEGORY_LABELS, TYPE_LABELS } from '../../transaction-labels';

/**
 * Una fila de movimiento: categoría, descripción, importe con signo y fecha.
 *
 * Sale de `overview/` en su **segundo** uso, que es cuando el árbol canónico
 * dice que se parte una pantalla en piezas — `features/<name>/components/`, no
 * `shared/ui/`. La regla que lo decide no es cuántas veces se usa sino de qué
 * depende: esto recibe un `TransactionResponse` y conoce las etiquetas del
 * dominio, así que es de Finanzas. Una primitiva de `shared/ui/` nunca recibe
 * un DTO de dominio.
 *
 * Lo que se evitaba duplicando: las tres copias del importe (color, signo y
 * tipo oculto) y el detalle de zona horaria de `parseIsoDate`. Cada una de esas
 * decisiones estaba comentada en `overview.html`, y una segunda copia es una
 * segunda copia que puede quedarse atrás.
 *
 * `class: 'card'` va en el `host` y no en la plantilla de quien lo monta: la
 * tarjeta es parte de lo que este componente es, no de dónde está. Las clases
 * globales aplican al anfitrión sin problema — la encapsulación reescribe
 * selectores de los estilos del componente, no los de `styles.scss`.
 */
@Component({
  selector: 'app-transaction-row',
  imports: [CurrencyPipe],
  templateUrl: './transaction-row.html',
  styleUrl: './transaction-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' }
})
export class TransactionRow {
  readonly transaction = input.required<TransactionResponse>();

  /**
   * Si la fecha incluye el mes.
   *
   * Existe por el historial, donde las filas van bajo un encabezado que ya dice
   * "Septiembre de 2026": repetir "12 sep" en las treinta filas de debajo es
   * ruido que compite con el importe, que es lo que se viene a leer. En el
   * resumen, donde las filas están sueltas, un "12" a secas no diría de cuándo.
   */
  readonly showMonth = input(true);

  private readonly locale = inject(LOCALE_ID);

  protected readonly moneyDigits = MONEY_DIGITS;

  protected readonly categoryLabel = computed(
    () => CATEGORY_LABELS[this.transaction().category]
  );

  protected readonly typeLabel = computed(() => TYPE_LABELS[this.transaction().type]);

  protected readonly isIncome = computed(() => this.transaction().type === 'INCOME');

  /**
   * El signo lo pone la plantilla a partir de `type`, así que el importe se
   * pinta en valor absoluto.
   *
   * Hoy el backend devuelve `amount` como magnitud positiva y el sentido lo
   * lleva `type`, con lo cual esto no cambia nada. Está por si algún día
   * devolviera los gastos en negativo: entonces la fila diría "−-12,00 €" en
   * vez de fallar, que es el tipo de error que nadie mira.
   */
  protected readonly amount = computed(() => Math.abs(this.transaction().amount));

  /**
   * "12 ago", o "12" dentro de un grupo mensual.
   *
   * `parseIsoDate` viene de `core/date/`: `new Date('2026-08-12')` es medianoche
   * **UTC**, así que al oeste de Greenwich mostraría el día anterior.
   */
  protected readonly dateLabel = computed(() =>
    parseIsoDate(this.transaction().date).toLocaleDateString(
      this.locale,
      this.showMonth() ? { day: 'numeric', month: 'short' } : { day: 'numeric' }
    )
  );
}
