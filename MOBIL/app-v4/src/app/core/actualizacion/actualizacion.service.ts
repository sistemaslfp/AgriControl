import { Injectable, inject, signal } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { ApiService, VersionResponse } from '../api/api.service';
import { APP_VERSION, APP_VERSION_CODE } from '../version';

interface ActualizadorPlugin {
  instalada(): Promise<{ versionCode: number; versionName: string }>;
  descargarEInstalar(o: { url: string; bytes: number }): Promise<{ estado: 'instalando' | 'permiso' }>;
  addListener(
    evento: 'progreso',
    fn: (e: { porcentaje: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const Actualizador = registerPlugin<ActualizadorPlugin>('Actualizador');

/**
 * Compara la version instalada con la publicada en GET /v4/version y, si hay
 * una mayor, la descarga y abre el instalador. Android siempre pide confirmar.
 */
@Injectable({ providedIn: 'root' })
export class ActualizacionService {
  private readonly api = inject(ApiService);

  readonly disponible = signal<VersionResponse | null>(null);
  readonly instalada = signal<{ versionCode: number; versionName: string }>({
    versionCode: APP_VERSION_CODE,
    versionName: APP_VERSION,
  });
  readonly progreso = signal<number | null>(null);

  async verificar(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        this.instalada.set(await Actualizador.instalada());
      }
      const v = await this.api.version();
      const nueva = v.disponible && v.version_code > this.instalada().versionCode;
      this.disponible.set(nueva ? v : null);
    } catch {
      // Sin servidor no hay nada que ofrecer; se vuelve a mirar al abrir el menu.
      this.disponible.set(null);
    }
  }

  /** Devuelve un texto para mostrar, o null si el instalador ya quedo abierto. */
  async actualizar(): Promise<string | null> {
    const v = this.disponible();
    if (!v || this.progreso() !== null) {
      return null;
    }
    const url = this.api.urlApk();
    if (!Capacitor.isNativePlatform()) {
      window.open(url, '_blank');
      return null;
    }
    this.progreso.set(0);
    const escucha = await Actualizador.addListener('progreso', (e) => this.progreso.set(e.porcentaje));
    try {
      const r = await Actualizador.descargarEInstalar({ url, bytes: v.bytes });
      return r.estado === 'permiso'
        ? 'Permite "Instalar apps desconocidas" para LAgricontrol, vuelve y toca Actualizar otra vez.'
        : null;
    } catch (e) {
      return `No se pudo actualizar: ${e instanceof Error ? e.message : 'error de red'}`;
    } finally {
      await escucha.remove();
      this.progreso.set(null);
    }
  }
}
