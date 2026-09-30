import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';

import { AppConfigService } from '../config/app-config.service';
import { SyncRequest, SyncResponse } from '../sync/sync.models';

export interface HoraResponse {
  server_time: string;
  server_epoch: number;
  timezone: string;
}

export interface VersionResponse {
  version_code: number;
  version_name: string;
  /** false si la config apunta a un APK que no esta en public/apk/. */
  disponible: boolean;
  bytes: number;
}

export interface BootstrapResponse {
  server_time: string;
  ventanas_horarias: {
    am: { inicio: string; fin: string };
    pm: { inicio: string; fin: string };
  };
  retroactividad_dias: Record<string, number>;
  cosecha_subtarea_ids: number[];
  catalogos_version: string;
}

export interface CatalogosResponse {
  version: string;
  fincas: { id: number; nombre: string; ha: number }[];
  // tiene_modulos viaja como booleano de verdad: V4.php castea los tipos
  // porque mysqli devuelve todo como string y el "0" string es truthy en JS.
  lotes: { id: number; lote: string; finca_id: number; ha: number; tiene_modulos: boolean }[];
  modulos: { id: number; modulo: string; lote_id: number; ha: number }[];
  cultivos: { id: number; nombre: string }[];
  tareas: { id: number; nombre: string; cultivos_id: number }[];
  subtareas: {
    id: number;
    codigo: string;
    nombre: string;
    tarea_id: number;
    /** z_subtarea.id_finca: cada finca tiene su propio juego de subtareas. */
    id_finca: number;
    unidad_labor_id: number;
    tipo_pago_id: number;
  }[];
  ulabores: { id: number; nombre: string }[];
  personal: { id: number; nombre: string; id_finca: number; rol: number; rol_app: string }[];
}

/**
 * Una asignacion AM abierta: una persona programada en una tarea de la
 * manana que todavia no tiene PM que la cierre. Es lo que lista la pantalla
 * PM (GET /v4/am_abiertos).
 */
export interface AsignacionAmApi {
  am_personal_id: number;
  am_guid: string;
  am_id: number;
  /** Guid del formulario. Lo comparten las N personas de la misma tarea. */
  captura_guid: string | null;
  fecha_proceso: string;
  finca_id: number;
  responsable_id: number;
  cultivo_id: number;
  lote_id: number;
  subtarea_id: number;
  personal_id: number;
  trabajador: string;
  lote: string;
  cultivo: string;
  subtarea: string;
  /** "3, 4" — modulos del AM, o null si el lote no trabaja por modulos. */
  modulos: string | null;
  /** "3,8" — los ids crudos de `lfp_am.modulos`, para elegir modulo por saco. */
  modulo_ids?: string | null;
  unidad_labor_id: number | null;
  unidad_labor: string | null;
}

export interface AmAbiertosResponse {
  server_time: string;
  fecha: string;
  asignaciones: AsignacionAmApi[];
}

/**
 * Un dia de cosecha que todavia no entro en ninguna partida de postcosecha.
 * `cosecha_ids` es lo que hay que devolverle al servidor al crear la partida:
 * v4 consume FILAS, no la fecha entera como hacia v3.
 */
export interface DiaPendienteApi {
  fecha: string;
  cosechas: number;
  sacos: number;
  peso: number;
  cosecha_ids: number[];
}

export interface PostcosechaPendientesResponse {
  server_time: string;
  dias: DiaPendienteApi[];
}

/** Una etapa ya registrada, con lo que se cargó en ella. */
export interface EtapaApi {
  etapa: string;
  inicio: string;
  fin: string | null;
  comentario: string | null;
}

/** El corte de grano del fermentado. Los porcentajes NO viajan: se calculan. */
export interface CalidadFermApi {
  fecha_muestra: string;
  buena: number;
  ligera: number;
  violeta: number;
}

/**
 * El análisis de un secado. `humedad_promedio` la calcula la base (columna
 * generada); `indice_grano_g` y `granos_vacios_pct` salen de la muestra de
 * 500 g (ver la pantalla de postcosecha).
 */
export interface CalidadSecApi {
  etapa: string;
  fecha_muestra: string;
  humedad_1: number;
  humedad_2: number;
  humedad_3: number;
  humedad_promedio: number;
  granos_muestra: number | null;
  indice_grano_g: number | null;
  granos_vacios_pct: number | null;
}

/** Un registro de postcosecha en curso (sin peso final). */
export interface PartidaApi {
  id: number;
  guid: string;
  lot_code: string;
  fecha_cosecha: string;
  fecha_inicio: string;
  peso_lote: number;
  peso_mallas: number;
  peso_baba: number;
  comentario: string | null;
  supervisor_id: number;
  supervisor: string | null;
  /** La ultima etapa registrada, o null si todavia no hay ninguna. */
  etapa: string | null;
  /** TODAS las etapas ya registradas, con sus datos: en la vida real se saltan. */
  etapas: EtapaApi[];
  cal_ferm: CalidadFermApi | null;
  /** Un analisis por cada secado que ya lo tenga. */
  cal_secado: CalidadSecApi[];
  cosechas: number;
}

export interface PostcosechaAbiertasResponse {
  server_time: string;
  partidas: PartidaApi[];
}

/**
 * Cliente HTTP de la API V4. Toda llamada sale de aquí; nadie más arma URLs.
 * El alias del dispositivo viaja en X-Device-Alias (trazabilidad, no auth).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private static readonly TIMEOUT_MS = 20000;

  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  hora(baseUrl?: string): Promise<HoraResponse> {
    return this.get<HoraResponse>('hora', baseUrl);
  }

  version(): Promise<VersionResponse> {
    return this.get<VersionResponse>('version');
  }

  /** URL del APK publicado; la descarga la hace el plugin nativo, no HttpClient. */
  urlApk(): string {
    return `${this.requerirBase()}/apk`;
  }

  bootstrap(): Promise<BootstrapResponse> {
    return this.get<BootstrapResponse>('bootstrap');
  }

  catalogos(): Promise<CatalogosResponse> {
    return this.get<CatalogosResponse>('catalogos');
  }

  /**
   * Asignaciones AM sin cerrar de esa fecha. `fecha` es obligatoria del lado
   * del servidor: sin ella la consulta barreria la tabla entera.
   *
   * Sin guion en la ruta: CodeIgniter mapea el segmento de URI al nombre del
   * metodo y `am-abiertos` no es un identificador PHP valido.
   */
  /**
   * `modulo` dice que pantalla pregunta: 'pm' (por defecto en el servidor)
   * trae todo MENOS cosecha y poscosecha, que tienen formulario propio;
   * 'cosecha' trae solo las tareas de cosecha.
   */
  amAbiertos(
    fecha: string,
    fincaId: number | null,
    modulo: 'pm' | 'cosecha' = 'pm',
  ): Promise<AmAbiertosResponse> {
    const q = `am_abiertos?fecha=${encodeURIComponent(fecha)}` +
      (fincaId !== null ? `&finca_id=${fincaId}` : '') +
      `&modulo=${modulo}`;
    return this.get<AmAbiertosResponse>(q);
  }

  /**
   * Dias de cosecha sin partida. Sin guion en la ruta, por lo mismo que
   * `am_abiertos`: CodeIgniter mapea el segmento de URI al nombre del metodo.
   */
  postcosechaPendientes(desde?: string): Promise<PostcosechaPendientesResponse> {
    const q = 'postcosecha_pendientes' + (desde ? `?desde=${encodeURIComponent(desde)}` : '');
    return this.get<PostcosechaPendientesResponse>(q);
  }

  postcosechaAbiertas(): Promise<PostcosechaAbiertasResponse> {
    return this.get<PostcosechaAbiertasResponse>('postcosecha_abiertas');
  }

  sync(body: SyncRequest): Promise<SyncResponse> {
    const url = `${this.requerirBase()}/sync`;
    return firstValueFrom(
      this.http
        .post<SyncResponse>(url, body, { headers: this.headers() })
        .pipe(timeout(ApiService.TIMEOUT_MS)),
    );
  }

  private get<T>(ruta: string, baseUrl?: string): Promise<T> {
    const base = baseUrl?.trim().replace(/\/+$/, '') || this.requerirBase();
    return firstValueFrom(
      this.http
        .get<T>(`${base}/${ruta}`, { headers: this.headers() })
        .pipe(timeout(ApiService.TIMEOUT_MS)),
    );
  }

  /**
   * URL base configurada, p. ej. https://servidor/v4
   * (la pantalla de Configuración la guarda completa, con /v4 incluido).
   */
  private requerirBase(): string {
    const base = this.config.baseUrl();
    if (!base) {
      throw new Error('No hay URL de servidor configurada.');
    }
    return base;
  }

  private headers(): HttpHeaders {
    const alias = this.config.deviceAlias();
    let h = new HttpHeaders();
    if (alias) {
      h = h.set('X-Device-Alias', alias);
    }
    return h;
  }
}
