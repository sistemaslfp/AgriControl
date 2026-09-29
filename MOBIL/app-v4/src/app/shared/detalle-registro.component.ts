import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { CatalogQueryService } from '../core/catalog/catalog-query.service';
import { RegistroColaVista } from '../core/sync/sync.models';

/**
 * Lo mínimo de una tarjeta de Registros que el detalle necesita mostrar.
 * No se importa `TarjetaRegistros` de `pages/registros`: `shared/` no depende
 * de `pages/` en ningún otro lado de la app, y `TarjetaRegistros` cumple esta
 * forma igual, por tipado estructural.
 */
export interface RegistroDetalleTarjeta {
  titulo: string;
  lote: string;
  labor: string;
  personas: string;
  fecha: string;
  motivo: string | null;
  registros: RegistroColaVista[];
}

/** Un campo del payload ya con etiqueta legible y valor formateado. */
interface CampoDetalle {
  etiqueta: string;
  valor: string;
}

/** Un registro (fila de sync_queue) con todo lo que trae, listo para pintar. */
interface BloqueDetalle {
  /** guid, o guid|modulo cuando una cosecha se parte por modulo. */
  clave: string;
  registro: RegistroColaVista;
  /** Cosecha: "PERSONA · Mód. 4". Vacio en los demas tipos. */
  subtitulo: string;
  campos: CampoDetalle[];
}

/**
 * Detalle de un registro: el payload campo por campo, con el UUID.
 *
 * Es lo único que quedó fuera del paso 4 (MOBIL/PROMPT-CONTINUAR.md,
 * "Detalle Registro"). Es una ventana flotante, igual que `app-selector`: se
 * abre al tocar una tarjeta de Registros y no agrega una pantalla nueva.
 *
 * Muestra el payload TAL CUAL viaja a `/v4/sync`, sin resolverlo contra los
 * catálogos, MENOS los ids y guid internos (Kevin, 2026-09-09): el único
 * identificador que queda es el UUID del propio registro, que es el que
 * hace falta para revisar `sync_queue`/`sync_audit`. Ver `CAMPO_ID`.
 */
@Component({
  selector: 'app-detalle-registro',
  standalone: true,
  // Mismo motivo que en `app-selector`: dentro de un ion-modal con
  // ng-template, un componente Angular normal queda `display: block` y con
  // la altura de su contenido, y el ion-header + ion-content se derrumban.
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title size="small">
          {{ tarjeta?.titulo }}
          @if (tarjeta?.lote) {
            · {{ tarjeta.lote }}
          }
        </ion-title>
        <ion-buttons slot="end">
          <ion-button class="boton-cerrar" (click)="cerrar.emit()">
            <strong>Cerrar</strong>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (tarjeta) {
        <p class="resumen">
          {{ tarjeta.labor }}
          @if (tarjeta.personas) {
            · {{ tarjeta.personas }}
          }
          · {{ tarjeta.fecha }}
        </p>
        @if (tarjeta.motivo) {
          <p class="motivo-rechazo">{{ tarjeta.motivo }}</p>
        }
      }

      @for (b of bloques(); track b.clave; let i = $index) {
        <ion-list inset="true" class="bloque-registro">
          @if (bloques().length > 1 || b.subtitulo) {
            <ion-item lines="none">
              <ion-label>
                @if (bloques().length > 1) {
                  <strong>Registro {{ i + 1 }} de {{ bloques().length }}</strong>
                }
                @if (b.subtitulo) {
                  <p class="subtitulo-bloque">{{ b.subtitulo }}</p>
                }
              </ion-label>
            </ion-item>
          }
          <ion-item lines="none">
            <ion-label>
              UUID
              <p class="guid">{{ b.registro.guid }}</p>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              Estado
              <p>{{ b.registro.estado }}</p>
            </ion-label>
          </ion-item>
          @if (b.registro.motivoRechazo) {
            <ion-item lines="none">
              <ion-label>
                Motivo del rechazo
                <p>{{ b.registro.motivoRechazo }}</p>
              </ion-label>
            </ion-item>
          }
          @if (b.registro.ultimoError) {
            <ion-item lines="none">
              <ion-label>
                Último error
                <p>{{ b.registro.ultimoError }}</p>
              </ion-label>
            </ion-item>
          }
          @if (b.registro.intentos > 0) {
            <ion-item lines="none">
              <ion-label>
                Intentos de envío
                <p>{{ b.registro.intentos }}</p>
              </ion-label>
            </ion-item>
          }
          <ion-item lines="none">
            <ion-label>
              Creado en el equipo
              <p>{{ b.registro.createdAtDevice }}</p>
            </ion-label>
          </ion-item>
          @if (b.registro.ackedAt) {
            <ion-item lines="none">
              <ion-label>
                Confirmado por el servidor
                <p>{{ b.registro.ackedAt }}</p>
              </ion-label>
            </ion-item>
          }
          @for (c of b.campos; track c.etiqueta) {
            <ion-item lines="full">
              <ion-label>
                {{ c.etiqueta }}
                <p class="valor-campo">{{ c.valor }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
  styles: [
    `
      .resumen {
        margin: 0 0 4px;
        color: var(--ion-color-medium-shade);
      }
      .motivo-rechazo {
        color: var(--ion-color-danger);
        font-weight: 500;
      }
      .bloque-registro {
        margin-bottom: 14px;
      }
      .subtitulo-bloque {
        font-weight: 600;
        color: var(--ion-color-primary);
      }
      .valor-campo {
        white-space: pre-line;
      }
      .guid {
        font-family: monospace;
        user-select: text;
        word-break: break-all;
      }
    `,
  ],
})
export class DetalleRegistroComponent implements OnInit {
  @Input() tarjeta: RegistroDetalleTarjeta | null = null;
  @Output() cerrar = new EventEmitter<void>();

  private readonly catalogo = inject(CatalogQueryService);
  /** id -> nombre de los modulos que aparecen en los sacos de cosecha. */
  private readonly nombresModulo = signal<Map<number, string>>(new Map());

  async ngOnInit(): Promise<void> {
    const ids = new Set<number>();
    for (const r of this.tarjeta?.registros ?? []) {
      const sacos = r.tipo === 'cosecha' ? r.payload['sacos'] : null;
      for (const s of Array.isArray(sacos) ? (sacos as Record<string, unknown>[]) : []) {
        const m = Number(s['modulo_id'] ?? 0);
        if (m > 0) ids.add(m);
      }
    }
    if (ids.size > 0) {
      this.nombresModulo.set(await this.catalogo.nombresModulo([...ids]));
    }
  }

  /**
   * Etiquetas legibles para los campos que SI se muestran. Lo que no está
   * aquí se muestra igual, con el nombre de columna pasado a texto plano
   * (`legible()`).
   */
  private static readonly ETIQUETAS: Record<string, string> = {
    fecha_proceso: 'Fecha del proceso',
    hora_cierre: 'Hora de cierre',
    cantidad: 'Cantidad',
    comentario: 'Comentario',
    observaciones: 'Observaciones',
    sacos: 'Sacos',
    total_sacos: 'Total de sacos',
    total_peso: 'Peso total',
    tiempo_riego_min: 'Tiempo de riego (min)',
    volumen_riego: 'Volumen de riego',
  };

  /**
   * Ningún id ni guid del payload se muestra aquí (Kevin, 2026-09-09): el
   * único identificador de la ventana es el UUID del registro, que es el que
   * hace falta para revisar `sync_queue`/`sync_audit`. `am_guid`,
   * `captura_guid`, `finca_id`, `subtarea_id`, etc. no aportan nada que un
   * supervisor pueda usar sin abrir la base.
   */
  private static readonly CAMPO_ID = /_ids?$|_guid$/i;

  /**
   * El payload TAL CUAL, un bloque por fila de la cola. Sin resolver contra
   * catálogos a propósito: esto es "qué hay adentro", no la tarjeta otra vez.
   */
  readonly bloques = computed<BloqueDetalle[]>(() => {
    this.nombresModulo();
    const t = this.tarjeta;
    if (!t) {
      return [];
    }
    return t.registros.flatMap((registro) => this.bloquesDe(registro));
  });

  /**
   * Una cosecha con sacos en varios modulos se parte en un bloque por modulo
   * (Kevin, 2026-09-29): A en 4 y 5 + B en 5 = tres bloques, cada uno con sus
   * sacos y sus totales. Es solo lectura: en la cola sigue siendo un registro.
   */
  private bloquesDe(registro: RegistroColaVista): BloqueDetalle[] {
    const entradas = Object.entries(registro.payload).filter(
      ([k]) => !DetalleRegistroComponent.CAMPO_ID.test(k),
    );
    const armar = (clave: string, subtitulo: string, payload: [string, unknown][]) => ({
      clave,
      registro,
      subtitulo,
      campos: payload.map(([k, v]) => this.campo(registro, k, v)),
    });
    const sacos = registro.payload['sacos'];
    if (registro.tipo !== 'cosecha' || !Array.isArray(sacos)) {
      return [armar(registro.guid, '', entradas)];
    }
    const persona = String(registro.meta?.trabajador ?? '');
    const porModulo = new Map<number, Record<string, unknown>[]>();
    for (const s of sacos as Record<string, unknown>[]) {
      const m = Number(s['modulo_id'] ?? 0);
      porModulo.set(m, [...(porModulo.get(m) ?? []), s]);
    }
    if (porModulo.size <= 1 && porModulo.has(0)) {
      return [armar(registro.guid, persona, entradas)];
    }
    const nombres = this.nombresModulo();
    const nombre = (m: number) => (m > 0 ? (nombres.get(m) ?? String(m)) : 'sin módulo');
    return [...porModulo.entries()]
      .sort(([a], [b]) => nombre(a).localeCompare(nombre(b), undefined, { numeric: true }))
      .map(([m, grupo]) => {
        const peso = Math.round(grupo.reduce((x, s) => x + Number(s['libras'] ?? 0), 0) * 100) / 100;
        const payload = entradas.map(([k, v]): [string, unknown] =>
          k === 'sacos' ? [k, grupo] : k === 'total_sacos' ? [k, grupo.length] : k === 'total_peso' ? [k, peso] : [k, v],
        );
        const sub = [persona, `Mód. ${nombre(m)}`].filter((x) => !!x).join(' · ');
        return armar(`${registro.guid}|${m}`, sub, payload);
      });
  }

  /**
   * En el PM la cantidad ES el avance, y sin su unidad el numero no dice nada
   * (3.5 Ha no es 3.5 Jornal). La unidad sale de `meta`, no del payload, que
   * sigue siendo el minimo que viaja; filas viejas sin `meta` quedan sin ella.
   */
  private campo(registro: RegistroColaVista, k: string, v: unknown): CampoDetalle {
    if (k === 'cantidad' && registro.tipo === 'pm') {
      const unidad = registro.meta?.unidadLabor;
      const valor = this.formatearValor(v);
      return { etiqueta: 'Avance', valor: unidad && valor !== '—' ? `${valor} ${unidad}` : valor };
    }
    if (k === 'sacos' && registro.tipo === 'cosecha' && Array.isArray(v)) {
      return { etiqueta: 'Sacos', valor: this.sacos(registro, v as Record<string, unknown>[]) };
    }
    return {
      etiqueta: DetalleRegistroComponent.ETIQUETAS[k] ?? this.legible(k),
      valor: this.formatearValor(v),
    };
  }

  /**
   * Un saco por linea, con nombres y no ids (Kevin, 2026-09-29). El lote sale
   * de `meta` porque el payload de cosecha no lo lleva; el modulo solo aparece
   * si el saco lo tiene (lote sin modulos = solo el lote).
   */
  private sacos(registro: RegistroColaVista, sacos: Record<string, unknown>[]): string {
    if (sacos.length === 0) {
      return '—';
    }
    const lote = String(registro.meta?.lote ?? '').replace(/^Lote\s+/i, '');
    const nombres = this.nombresModulo();
    return sacos
      .map((s) => {
        const partes = [`número: ${s['numero']}`, `libras: ${s['libras']}`];
        if (lote) partes.push(`lote: ${lote}`);
        const m = Number(s['modulo_id'] ?? 0);
        if (m > 0) partes.push(`módulo: ${nombres.get(m) ?? m}`);
        return partes.join(', ');
      })
      .join('\n');
  }

  private legible(clave: string): string {
    const s = clave.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private formatearValor(v: unknown): string {
    if (v === null || v === undefined || v === '') {
      return '—';
    }
    if (typeof v === 'boolean') {
      return v ? 'Sí' : 'No';
    }
    if (Array.isArray(v)) {
      if (v.length === 0) {
        return '—';
      }
      if (typeof v[0] === 'object' && v[0] !== null) {
        return v
          .map((o) =>
            Object.entries(o as Record<string, unknown>)
              .map(([k, val]) => `${k}: ${val}`)
              .join(', '),
          )
          .join(' · ');
      }
      return v.join(', ');
    }
    if (typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>)
        .map(([k, val]) => `${k}: ${val}`)
        .join(', ');
    }
    return String(v);
  }
}
