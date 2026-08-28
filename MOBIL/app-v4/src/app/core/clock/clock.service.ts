import { Injectable, inject, signal } from '@angular/core';

import { AppConfigService, KV } from '../config/app-config.service';
import { ApiService } from '../api/api.service';

/**
 * Reloj corregido por el servidor (MOBIL/01-sincronizacion.md §Los tres
 * tiempos). El reloj del teléfono se puede cambiar en dos toques, así que
 * jamás se usa pelado para validar: todo "ahora" de negocio sale de
 * `device_now + clock_offset`.
 *
 * Si la app nunca sincronizó hora, `offsetSeconds` es null: se permite
 * capturar igual y los registros viajan marcados como no verificables
 * (el servidor les pone el flag `sin_offset_reloj`).
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly config = inject(AppConfigService);
  private readonly api = inject(ApiService);

  /** null = nunca se sincronizó contra /v4/hora. */
  readonly offsetSeconds = signal<number | null>(null);
  readonly syncedAt = signal<string | null>(null);

  private cargado = false;

  async cargar(): Promise<void> {
    if (this.cargado) {
      return;
    }
    const offset = await this.config.get(KV.CLOCK_OFFSET_SECONDS);
    this.offsetSeconds.set(offset !== null ? parseInt(offset, 10) : null);
    this.syncedAt.set(await this.config.get(KV.CLOCK_SYNCED_AT));
    this.cargado = true;
  }

  /**
   * GET /v4/hora -> clock_offset_seconds = server_epoch - device_epoch.
   * Devuelve la respuesta del servidor para que la UI la muestre
   * (pantalla Configuración -> "Probar conexión").
   */
  async sincronizar(): Promise<{ serverTime: string; offsetSeconds: number }> {
    const hora = await this.api.hora();
    const deviceEpoch = Math.floor(Date.now() / 1000);
    const offset = hora.server_epoch - deviceEpoch;

    await this.config.set(KV.CLOCK_OFFSET_SECONDS, String(offset));
    const ahora = new Date().toISOString();
    await this.config.set(KV.CLOCK_SYNCED_AT, ahora);
    this.offsetSeconds.set(offset);
    this.syncedAt.set(ahora);

    return { serverTime: hora.server_time, offsetSeconds: offset };
  }

  /**
   * "Ahora" corregido, en milisegundos epoch. Si nunca hubo sincronización
   * devuelve el reloj del dispositivo tal cual — el llamador puede saberlo
   * consultando offsetSeconds() === null.
   */
  ahoraCorregidoMs(): number {
    const offset = this.offsetSeconds();
    return Date.now() + (offset ?? 0) * 1000;
  }

  ahoraCorregido(): Date {
    return new Date(this.ahoraCorregidoMs());
  }
}
