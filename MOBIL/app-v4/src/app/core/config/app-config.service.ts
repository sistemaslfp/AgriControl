import { Injectable, inject, signal } from '@angular/core';

import { DatabaseService } from '../db/database.service';

/** Claves usadas en app_kv. Centralizadas para no tipear strings sueltos. */
export const KV = {
  BASE_URL: 'base_url',
  DEVICE_ALIAS: 'device_alias',
  CLOCK_OFFSET_SECONDS: 'clock_offset_seconds',
  CLOCK_SYNCED_AT: 'clock_synced_at',
  LAST_SYNC_OK_AT: 'last_sync_ok_at',
  CATALOGOS_VERSION: 'catalogos_version',
  CATALOGOS_UPDATED_AT: 'catalogos_updated_at',
} as const;

/**
 * Configuración persistente del dispositivo (tabla app_kv en SQLite).
 * Sin login: la identidad del dispositivo es el alias (trazabilidad,
 * no seguridad — MOBIL/01-sincronizacion.md §Identificación).
 */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly database = inject(DatabaseService);

  /** Espejos reactivos de las claves que la UI observa. */
  readonly baseUrl = signal<string | null>(null);
  readonly deviceAlias = signal<string | null>(null);
  readonly lastSyncOkAt = signal<string | null>(null);
  readonly catalogosUpdatedAt = signal<string | null>(null);

  private cargado = false;

  /** Carga inicial de los espejos. Idempotente. */
  async cargar(): Promise<void> {
    if (this.cargado) {
      return;
    }
    this.baseUrl.set(await this.get(KV.BASE_URL));
    this.deviceAlias.set(await this.get(KV.DEVICE_ALIAS));
    this.lastSyncOkAt.set(await this.get(KV.LAST_SYNC_OK_AT));
    this.catalogosUpdatedAt.set(await this.get(KV.CATALOGOS_UPDATED_AT));
    this.cargado = true;
  }

  async get(clave: string): Promise<string | null> {
    const db = await this.database.abrir();
    const r = await db.query('SELECT valor FROM app_kv WHERE clave = ?;', [clave]);
    return r.values && r.values.length > 0 ? (r.values[0]['valor'] as string) : null;
  }

  async set(clave: string, valor: string): Promise<void> {
    const db = await this.database.abrir();
    await db.run(
      'INSERT INTO app_kv (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor;',
      [clave, valor],
    );
    await this.database.persistir();
    this.reflejar(clave, valor);
  }

  async setBaseUrl(url: string): Promise<void> {
    // Normaliza: sin barra final, para concatenar rutas sin sorpresas.
    await this.set(KV.BASE_URL, url.trim().replace(/\/+$/, ''));
  }

  async setDeviceAlias(alias: string): Promise<void> {
    await this.set(KV.DEVICE_ALIAS, alias.trim().toUpperCase());
  }

  private reflejar(clave: string, valor: string): void {
    switch (clave) {
      case KV.BASE_URL:
        this.baseUrl.set(valor);
        break;
      case KV.DEVICE_ALIAS:
        this.deviceAlias.set(valor);
        break;
      case KV.LAST_SYNC_OK_AT:
        this.lastSyncOkAt.set(valor);
        break;
      case KV.CATALOGOS_UPDATED_AT:
        this.catalogosUpdatedAt.set(valor);
        break;
    }
  }
}
