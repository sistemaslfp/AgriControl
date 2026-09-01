import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRadio,
  IonRadioGroup,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { OpcionCatalogo } from '../core/catalog/catalog-query.service';

/**
 * Selector con buscador, en simple o múltiple.
 *
 * Reemplaza al action sheet de la app vieja, que mostraba las ~1.100 personas
 * en una lista sin filtro ni búsqueda (03-pantallas.md §AM: "es la queja más
 * previsible del usuario").
 *
 * Tres cosas decididas el 2026-08-31 mirando la pantalla:
 *
 * - **Es una ventana flotante, no una pantalla completa**, y se cierra tocando
 *   fuera. La clase `selector-flotante` y la altura automática viven en
 *   `styles.scss`, porque el contenido del modal se proyecta fuera del ámbito
 *   de estilos del componente.
 * - **El buscador aparece solo si hace falta.** Con seis supervisores es
 *   estorbo; con 1.100 personas es imprescindible. El corte está en
 *   `UMBRAL_BUSCADOR`.
 * - **En modo múltiple cada toque aplica ya** (`cambio`), y "Listo" o el toque
 *   afuera solo cierran. Así ninguna elección se pierde por cerrar sin
 *   confirmar.
 *
 * Zoneless: la búsqueda entra por (ionInput) a un signal, no por ngModel. Un
 * campo plano mutado desde un callback no repinta y tampoco avisa.
 */
@Component({
  selector: 'app-selector',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonCheckbox,
    IonContent,
    IonFooter,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonRadio,
    IonRadioGroup,
    IonSearchbar,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title size="small">{{ titulo }}</ion-title>
        <ion-buttons slot="end">
          <ion-button class="boton-listo" (click)="cerrar.emit()">
            <strong>Listo</strong>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      @if (mostrarBuscador()) {
        <ion-toolbar>
          <ion-searchbar
            placeholder="Buscar…"
            [debounce]="120"
            (ionInput)="busqueda.set($any($event.target).value ?? '')"
          ></ion-searchbar>
        </ion-toolbar>
      }
    </ion-header>

    <ion-content>
      @if (filtradas().length === 0) {
        <ion-note class="vacio">
          @if (opciones.length === 0) {
            {{ vacioTexto }}
          } @else {
            Ninguna opción coincide con “{{ busqueda() }}”.
          }
        </ion-note>
      } @else if (multiple) {
        <ion-list>
          @for (o of filtradas(); track o.id) {
            <ion-item>
              <ion-checkbox
                [checked]="elegidos().has(o.id)"
                (ionChange)="alternar(o.id)"
                labelPlacement="end"
                justify="start"
              >
                <ion-label>
                  {{ o.nombre }}
                  @if (o.detalle) {
                    <p>{{ o.detalle }}</p>
                  }
                </ion-label>
              </ion-checkbox>
            </ion-item>
          }
        </ion-list>
      } @else {
        <ion-radio-group [value]="unico()" (ionChange)="elegirUno($any($event.detail).value)">
          <ion-list>
            @for (o of filtradas(); track o.id) {
              <ion-item>
                <ion-radio [value]="o.id" labelPlacement="end" justify="start">
                  <ion-label>
                    {{ o.nombre }}
                    @if (o.detalle) {
                      <p>{{ o.detalle }}</p>
                    }
                  </ion-label>
                </ion-radio>
              </ion-item>
            }
          </ion-list>
        </ion-radio-group>
      }
    </ion-content>

    @if (multiple) {
      <ion-footer>
        <ion-toolbar>
          <ion-title size="small">
            {{ elegidos().size }} seleccionada(s) · {{ filtradas().length }} en la lista
          </ion-title>
        </ion-toolbar>
      </ion-footer>
    }
  `,
  styles: [
    `
      .vacio {
        display: block;
        padding: 24px 20px;
        text-align: center;
      }
    `,
  ],
})
export class SelectorComponent implements OnInit {
  /** A partir de acá la lista deja de recorrerse de un vistazo. */
  private static readonly UMBRAL_BUSCADOR = 10;

  @Input({ required: true }) titulo = '';
  @Input({ required: true }) opciones: OpcionCatalogo[] = [];
  @Input() multiple = false;
  /** Ids preseleccionados. En modo simple se usa el primero. */
  @Input() seleccion: number[] = [];
  @Input() vacioTexto = 'No hay opciones para elegir.';
  /** null = automático según la cantidad de opciones. */
  @Input() conBuscador: boolean | null = null;

  /** Modo simple: elección definitiva; el padre cierra la ventana. */
  @Output() confirmar = new EventEmitter<number[]>();
  /** Modo múltiple: se aplica en vivo, sin cerrar. */
  @Output() cambio = new EventEmitter<number[]>();
  @Output() cerrar = new EventEmitter<void>();

  readonly busqueda = signal('');
  readonly elegidos = signal<ReadonlySet<number>>(new Set<number>());

  readonly mostrarBuscador = computed(() =>
    this.conBuscador === null
      ? this.opciones.length > SelectorComponent.UMBRAL_BUSCADOR
      : this.conBuscador,
  );

  readonly filtradas = computed(() => {
    const q = this.normalizar(this.busqueda());
    if (!q) {
      return this.opciones;
    }
    // Todas las palabras del texto tienen que aparecer: con 1.100 nombres,
    // "ALAVA ERICKA" tiene que encontrar "ALAVA TOMALA ERICKA PATRICIA".
    const palabras = q.split(/\s+/).filter(Boolean);
    return this.opciones.filter((o) => {
      const texto = this.normalizar(`${o.nombre} ${o.detalle ?? ''}`);
      return palabras.every((p) => texto.includes(p));
    });
  });

  readonly unico = computed(() => {
    const [primero] = [...this.elegidos()];
    return primero ?? null;
  });

  ngOnInit(): void {
    this.elegidos.set(new Set(this.seleccion));
  }

  alternar(id: number): void {
    const s = new Set(this.elegidos());
    if (s.has(id)) {
      s.delete(id);
    } else {
      s.add(id);
    }
    this.elegidos.set(s);
    this.cambio.emit([...s]);
  }

  elegirUno(id: number): void {
    this.elegidos.set(new Set([id]));
    this.confirmar.emit([id]);
  }

  /** Sin tildes y en minúsculas: nadie escribe "TOMALÁ" en el buscador. */
  private normalizar(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}
