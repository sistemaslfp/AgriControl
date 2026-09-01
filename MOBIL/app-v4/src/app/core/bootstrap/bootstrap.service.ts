import { Injectable, inject, signal } from '@angular/core';

import { ApiService, BootstrapResponse } from '../api/api.service';
import { AppConfigService, KV } from '../config/app-config.service';

/**
 * Parámetros de operación que manda el servidor (GET /v4/bootstrap):
 * ventanas horarias AM/PM y ventanas de retroactividad por módulo.
 *
 * Se guardan en app_kv y se leen de ahí al arrancar, para que la app pueda
 * capturar sin red. Cambiar un número en `application/config/v4.php` no
 * exige recompilar nada: la próxima sincronización lo trae.
 *
 * Los valores de abajo son el fallback del PRIMER arranque, antes de la
 * primera conexión. Coinciden con `application/config/v4.php`, donde las
 * ventanas de retroactividad siguen marcadas [CONFIRMAR] (pendiente #1 de
 * 00-plan.md): son propuesta, no decisión de negocio.
 */
export const BOOTSTRAP_FALLBACK: BootstrapResponse = {
  server_time: '',
  ventanas_horarias: {
    am: { inicio: '06:00', fin: '12:00' },
    pm: { inicio: '13:00', fin: '18:00' },
  },
  retroactividad_dias: { am: 3, pm: 3, cosecha: 7, riego: 7, postcosecha: 30 },
  cosecha_subtarea_ids: [],
  catalogos_version: '',
};

@Injectable({ providedIn: 'root' })
export class BootstrapService {
  private readonly api = inject(ApiService);
  private readonly config = inject(AppConfigService);

  readonly datos = signal<BootstrapResponse>(BOOTSTRAP_FALLBACK);
  /** null = nunca se trajo del servidor; los valores son el fallback local. */
  readonly obtenidoAt = signal<string | null>(null);

  private cargado = false;

  async cargar(): Promise<void> {
    if (this.cargado) {
      return;
    }
    const crudo = await this.config.get(KV.BOOTSTRAP_JSON);
    if (crudo) {
      try {
        this.datos.set(this.normalizar(JSON.parse(crudo)));
        this.obtenidoAt.set(await this.config.get(KV.BOOTSTRAP_AT));
      } catch {
        // Guardado corrupto: se sigue con el fallback, no se rompe la captura.
      }
    }
    this.cargado = true;
  }

  /** Lo llama Configuración y "Actualizar Maestros". Lanza si no hay red. */
  async actualizar(): Promise<BootstrapResponse> {
    const datos = this.normalizar(await this.api.bootstrap());
    const ahora = new Date().toISOString();
    await this.config.set(KV.BOOTSTRAP_JSON, JSON.stringify(datos));
    await this.config.set(KV.BOOTSTRAP_AT, ahora);
    this.datos.set(datos);
    this.obtenidoAt.set(ahora);
    this.cargado = true;
    return datos;
  }

  /**
   * Una respuesta a medias no debe dejar la app sin ventanas: cada campo
   * ausente cae al fallback. Sin esto, un servidor viejo tumbaría el
   * selector de fechas con un `undefined`.
   */
  private normalizar(d: Partial<BootstrapResponse> | null): BootstrapResponse {
    const f = BOOTSTRAP_FALLBACK;
    return {
      server_time: d?.server_time ?? '',
      ventanas_horarias: {
        am: d?.ventanas_horarias?.am ?? f.ventanas_horarias.am,
        pm: d?.ventanas_horarias?.pm ?? f.ventanas_horarias.pm,
      },
      retroactividad_dias: { ...f.retroactividad_dias, ...(d?.retroactividad_dias ?? {}) },
      cosecha_subtarea_ids: Array.isArray(d?.cosecha_subtarea_ids) ? d!.cosecha_subtarea_ids : [],
      catalogos_version: d?.catalogos_version ?? '',
    };
  }
}
