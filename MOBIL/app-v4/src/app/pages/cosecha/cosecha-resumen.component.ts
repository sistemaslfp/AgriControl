import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';

import { CatalogQueryService } from '../../core/catalog/catalog-query.service';
import { FechaService } from '../../core/captura/fecha.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';
import { RegistroColaVista } from '../../core/sync/sync.models';

/** Una card: lo cosechado en un dia, en un lote y un modulo. */
interface CardResumen {
  clave: string;
  fecha: string;
  supervisor: string;
  lote: string;
  modulo: string;
  subtarea: string;
  personas: number;
  sacos: number;
  peso: number;
}

interface Acumulado {
  fecha: string;
  lote: string;
  modulo: string;
  supervisores: Set<number>;
  subtareas: Set<string>;
  personas: Set<number>;
  sacos: number;
  peso: number;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function aFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumarDias(iso: string, n: number): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
}

/** Lunes de la semana ISO que contiene `iso`. */
function lunesDe(iso: string): string {
  const d = aFecha(iso);
  return sumarDias(iso, -((d.getUTCDay() + 6) % 7));
}

/** Numero de semana ISO (la misma que `WEEK(fecha,3)` en el servidor). */
function semanaIso(iso: string): { anio: number; semana: number } {
  const jueves = aFecha(sumarDias(lunesDe(iso), 3));
  const anio = jueves.getUTCFullYear();
  const primerJueves = aFecha(sumarDias(lunesDe(`${anio}-01-04`), 3));
  const semana = 1 + Math.round((jueves.getTime() - primerJueves.getTime()) / (7 * 86400000));
  return { anio, semana };
}

function corta(iso: string): string {
  const d = aFecha(iso);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/**
 * Resumen semanal de cosecha por fecha, lote y modulo.
 *
 * Sale SOLO de la cola local (Kevin, 2026-09-29): lo capturado en este equipo,
 * y los enviados se purgan a los 30 dias. Los RECHAZADOS no cuentan porque el
 * servidor no los aplico. El modulo se toma de cada saco; los registros previos
 * al modulo por saco caen en el texto de modulos del AM.
 */
@Component({
  selector: 'app-cosecha-resumen',
  standalone: true,
  templateUrl: './cosecha-resumen.component.html',
  styleUrls: ['./cosecha-resumen.component.scss'],
  imports: [IonButton, IonIcon, IonSpinner],
})
export class CosechaResumenComponent implements OnInit {
  private readonly cola = inject(SyncQueueService);
  private readonly catalogo = inject(CatalogQueryService);
  private readonly fechas = inject(FechaService);

  private readonly hoy = signal('');
  readonly lunes = signal('');
  readonly cargando = signal(false);
  private readonly registros = signal<RegistroColaVista[]>([]);
  private readonly supervisores = signal<Map<number, string>>(new Map());
  private readonly modulos = signal<Map<number, string>>(new Map());
  /** Claves de las cards con el supervisor desplegado. */
  readonly abiertas = signal<Set<string>>(new Set());

  readonly domingo = computed(() => (this.lunes() ? sumarDias(this.lunes(), 6) : ''));
  readonly esSemanaActual = computed(() => this.lunes() === lunesDe(this.hoy() || this.lunes()));
  readonly etiquetaSemana = computed(() => {
    if (!this.lunes()) return '';
    const { semana } = semanaIso(this.lunes());
    return `Semana ${semana}`;
  });
  readonly rangoSemana = computed(() => {
    if (!this.lunes()) return '';
    const fin = this.domingo();
    return `${corta(this.lunes())} – ${corta(fin)} ${fin.slice(0, 4)}`;
  });

  readonly cards = computed<CardResumen[]>(() => {
    const desde = this.lunes();
    const hasta = this.domingo();
    const nombresMod = this.modulos();
    const nombresSup = this.supervisores();
    const grupos = new Map<string, Acumulado>();

    for (const r of this.registros()) {
      const fecha = String(r.payload['hora_cierre'] ?? '').slice(0, 10);
      if (!fecha || fecha < desde || fecha > hasta) continue;
      const loteId = r.meta?.loteId ?? 0;
      const lote = r.meta?.lote ?? 'Sin lote';
      const supervisor = Number(r.payload['responsable_id'] ?? 0);
      const trabajador = Number(r.payload['trabajador_id'] ?? 0);
      const subtarea = r.meta?.subtarea ?? '';
      const sacos = Array.isArray(r.payload['sacos'])
        ? (r.payload['sacos'] as Record<string, unknown>[])
        : [];

      for (const s of sacos) {
        const libras = Number(s['libras'] ?? 0);
        if (!(libras > 0)) continue;
        const moduloId = s['modulo_id'] == null ? null : Number(s['modulo_id']);
        const modulo =
          moduloId !== null
            ? (nombresMod.get(moduloId) ?? String(moduloId))
            : (r.meta?.modulos || '—');
        const clave = `${fecha}|${loteId}|${moduloId ?? `t:${modulo}`}`;
        let g = grupos.get(clave);
        if (!g) {
          g = {
            fecha,
            lote,
            modulo,
            supervisores: new Set(),
            subtareas: new Set(),
            personas: new Set(),
            sacos: 0,
            peso: 0,
          };
          grupos.set(clave, g);
        }
        if (supervisor) g.supervisores.add(supervisor);
        if (subtarea) g.subtareas.add(subtarea);
        g.personas.add(trabajador);
        g.sacos += 1;
        g.peso += libras;
      }
    }

    return [...grupos.entries()]
      .map(([clave, g]) => ({
        clave,
        fecha: g.fecha,
        supervisor:
          [...g.supervisores].map((id) => nombresSup.get(id) ?? `#${id}`).join(', ') || '—',
        lote: g.lote,
        modulo: g.modulo,
        subtarea: [...g.subtareas].join(', ') || '—',
        personas: g.personas.size,
        sacos: g.sacos,
        peso: Math.round(g.peso * 100) / 100,
      }))
      .sort(
        (a, b) =>
          b.fecha.localeCompare(a.fecha) ||
          a.lote.localeCompare(b.lote, 'es', { numeric: true }) ||
          a.modulo.localeCompare(b.modulo, 'es', { numeric: true }),
      );
  });

  constructor() {
    addIcons({ chevronBackOutline, chevronForwardOutline });
  }

  async ngOnInit(): Promise<void> {
    const hoy = this.fechas.ahoraLocal().slice(0, 10);
    this.hoy.set(hoy);
    this.lunes.set(lunesDe(hoy));
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const regs = (await this.cola.listar(['PENDIENTE', 'ENVIANDO', 'ENVIADO'])).filter(
        (r) => r.tipo === 'cosecha',
      );
      const idsSup = new Set<number>();
      const idsMod = new Set<number>();
      for (const r of regs) {
        const sup = Number(r.payload['responsable_id'] ?? 0);
        if (sup) idsSup.add(sup);
        const sacos = Array.isArray(r.payload['sacos'])
          ? (r.payload['sacos'] as Record<string, unknown>[])
          : [];
        for (const s of sacos) {
          if (s['modulo_id'] != null) idsMod.add(Number(s['modulo_id']));
        }
      }
      this.supervisores.set(await this.catalogo.nombresPersonal([...idsSup]));
      this.modulos.set(await this.catalogo.nombresModulo([...idsMod]));
      this.registros.set(regs);
    } finally {
      this.cargando.set(false);
    }
  }

  moverSemana(delta: number): void {
    if (delta > 0 && this.esSemanaActual()) return;
    this.lunes.set(sumarDias(this.lunes(), delta * 7));
    this.abiertas.set(new Set());
  }

  alternarSupervisor(clave: string): void {
    const s = new Set(this.abiertas());
    if (s.has(clave)) s.delete(clave);
    else s.add(clave);
    this.abiertas.set(s);
  }

  fechaLarga(iso: string): string {
    return `${DIAS[aFecha(iso).getUTCDay()]} ${corta(iso)}`;
  }
}
