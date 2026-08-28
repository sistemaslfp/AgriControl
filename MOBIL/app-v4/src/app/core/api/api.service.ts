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
  lotes: { id: number; lote: string; finca_id: number; ha: number; tiene_modulos: number }[];
  modulos: { id: number; modulo: string; lote_id: number; ha: number }[];
  cultivos: { id: number; nombre: string }[];
  tareas: { id: number; nombre: string; cultivos_id: number }[];
  subtareas: {
    id: number;
    codigo: string;
    nombre: string;
    tarea_id: number;
    unidad_labor_id: number;
    tipo_pago_id: number;
  }[];
  ulabores: { id: number; nombre: string }[];
  personal: { id: number; nombre: string; id_finca: number; rol: number; rol_app: string }[];
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

  bootstrap(): Promise<BootstrapResponse> {
    return this.get<BootstrapResponse>('bootstrap');
  }

  catalogos(): Promise<CatalogosResponse> {
    return this.get<CatalogosResponse>('catalogos');
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
