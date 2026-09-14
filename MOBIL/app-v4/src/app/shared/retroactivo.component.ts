import { Component, computed, input, model } from '@angular/core';
import { IonCheckbox, IonInput, IonItem, IonList, IonNote } from '@ionic/angular';

import { EvaluacionFecha } from '../core/captura/fecha.service';

/** Lo minimo que se acepta como motivo. Cinco caracteres descartan "x" y ".". */
export const MINIMO_JUSTIFICACION = 5;

/**
 * Los dos problemas que el modo libre puede tener, con el mismo texto en las
 * cinco pantallas.
 *
 * Esta suelto y no adentro del componente porque quien valida es la PAGINA:
 * el boton de guardar mira su propia lista de `problemas()` y este es un
 * renglon mas de esa lista, no un estado del componente.
 */
export function problemasRetroactivo(
  ev: EvaluacionFecha | null,
  activo: boolean,
  justificacion: string,
): string[] {
  const p: string[] = [];
  if (ev?.excedeRetroactividad && !activo) {
    p.push(
      `La fecha supera los ${ev.diasRetroactividad} días de retroactividad: ` +
        'activa "Estoy cargando un día anterior".',
    );
  }
  if (activo && justificacion.trim().length < MINIMO_JUSTIFICACION) {
    p.push('Un registro retroactivo necesita una justificación escrita.');
  }
  return p;
}

/**
 * El texto que viaja al servidor en `justificacion_retro`, o null.
 *
 * DESDE EL 2026-09-14 ES UN CAMPO PROPIO. Antes iba pegado dentro de
 * `comentario` como '[RETROACTIVO] ...' y recortado a 255 entre los dos: no
 * habia forma de listar los registros retroactivos ni de leer el motivo sin
 * parsear texto libre. En riego era peor todavia, porque las observaciones
 * son por fila y el motivo se habria repetido en las 18-25 filas del parte.
 */
export function justificacionParaEnviar(activo: boolean, justificacion: string): string | null {
  const t = justificacion.trim();
  return activo && t.length > 0 ? t.slice(0, 255) : null;
}

/**
 * Interruptor de "estoy cargando un dia anterior" + el motivo.
 *
 * Es un componente y no HTML repetido porque desde el 2026-09-14 lo usan las
 * CINCO pantallas (antes solo AM, y las otras cuatro tenian la ventana como
 * limite duro del calendario: PM y AM 3 dias, cosecha y riego 7,
 * postcosecha 30, sin forma de pasarse).
 *
 * "Retroactivo" no se dice en pantalla: el interruptor habla en el idioma del
 * campo ("estoy cargando un dia anterior"), decision de Kevin del 2026-08-31.
 */
@Component({
  selector: 'app-retroactivo',
  standalone: true,
  imports: [IonList, IonItem, IonCheckbox, IonInput, IonNote],
  template: `
    <ion-list inset="true">
      <ion-item>
        <ion-checkbox
          [checked]="activo()"
          (ionChange)="activo.set($any($event.detail).checked)"
          labelPlacement="end"
          justify="start"
        >
          Estoy cargando un día anterior
        </ion-checkbox>
      </ion-item>
      @if (activo()) {
        <ion-item>
          <ion-input
            label="¿Por qué se carga tarde? (obligatorio)"
            labelPlacement="stacked"
            [placeholder]="ejemplo()"
            [value]="justificacion()"
            (ionInput)="justificacion.set($any($event.target).value ?? '')"
          ></ion-input>
        </ion-item>
      }
      <ion-item lines="none">
        <ion-note>{{ nota() }}</ion-note>
      </ion-item>
    </ion-list>
  `,
})
export class RetroactivoComponent {
  /** Los dias de la ventana del modulo, solo para el texto de ayuda. */
  readonly dias = input.required<number>();
  readonly ejemplo = input('Ej.: sin señal en el lote, se cargó al día siguiente');

  readonly activo = model(false);
  readonly justificacion = model('');

  readonly nota = computed(() =>
    this.activo()
      ? 'El calendario quedó abierto hacia atrás. El motivo se guarda con el registro.'
      : `Sin esto, el calendario sólo deja elegir los últimos ${this.dias()} días.`,
  );
}
