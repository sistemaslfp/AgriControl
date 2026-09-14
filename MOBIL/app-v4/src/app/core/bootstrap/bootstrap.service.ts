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

/** Los cinco modulos que tienen ventana de retroactividad. */
export const MODULOS_RETRO = ['am', 'pm', 'cosecha', 'riego', 'postcosecha'] as const;
export type ModuloRetro = (typeof MODULOS_RETRO)[number];
export type OverrideRetro = Partial<Record<ModuloRetro, number>>;

/**
 * Tope de lo que se puede escribir en Configuracion. No es una regla de
 * negocio: es el filtro contra el dedazo (un "3000" que deje el selector
 * abierto ocho anios). El modo libre de las pantallas usa su propio tope,
 * `FechaService.TOPE_RETROACTIVO_DIAS`.
 */
export const TOPE_VENTANA_DIAS = 400;

@Injectable({ providedIn: 'root' })
export class BootstrapService {
  private readonly api = inject(ApiService);
  private readonly config = inject(AppConfigService);

  readonly datos = signal<BootstrapResponse>(BOOTSTRAP_FALLBACK);
  /** null = nunca se trajo del servidor; los valores son el fallback local. */
  readonly obtenidoAt = signal<string | null>(null);
  /** Ventanas cambiadas en ESTE equipo. Le ganan al servidor. */
  readonly override = signal<OverrideRetro>({});

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
    await this.cargarOverride();
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

  // ------------------------------------------------------------------
  // Ventanas de retroactividad: el equipo le gana al servidor
  // ------------------------------------------------------------------

  /**
   * Lee el override guardado en app_kv. Un JSON corrupto o con basura adentro
   * se ignora en silencio en vez de tumbar el arranque: sin ventanas no hay
   * selector de fecha y no se puede capturar nada.
   */
  private async cargarOverride(): Promise<void> {
    const crudo = await this.config.get(KV.RETRO_OVERRIDE);
    if (!crudo) {
      return;
    }
    try {
      const d = JSON.parse(crudo) as Record<string, unknown>;
      const limpio: OverrideRetro = {};
      for (const m of MODULOS_RETRO) {
        const v = Number(d[m]);
        if (Number.isInteger(v) && v >= 0 && v <= TOPE_VENTANA_DIAS) {
          limpio[m] = v;
        }
      }
      this.override.set(limpio);
    } catch {
      // guardado corrupto: se sigue con lo del servidor
    }
  }

  /**
   * Dias de retroactividad EFECTIVOS de un modulo.
   *
   * Precedencia: lo que se cambio en Configuracion gana sobre lo que manda
   * `/v4/bootstrap` (Kevin, 2026-09-14). Es al reves de lo natural, y es a
   * proposito: si mandara el servidor, el cambio del usuario duraria hasta el
   * proximo "Actualizar Maestros" y se borraria solo, que es peor que no
   * poder cambiarlo.
   */
  retroactividadDias(modulo: ModuloRetro): number {
    const propio = this.override()[modulo];
    if (propio !== undefined) {
      return propio;
    }
    return Number(this.datos().retroactividad_dias[modulo] ?? 0);
  }

  /** Lo que mandaria el servidor si nadie hubiera tocado nada. */
  retroactividadDelServidor(modulo: ModuloRetro): number {
    return Number(this.datos().retroactividad_dias[modulo] ?? 0);
  }

  /** true si ese numero se cambio en ESTE equipo. Lo muestra Configuracion. */
  esDelEquipo(modulo: ModuloRetro): boolean {
    return this.override()[modulo] !== undefined;
  }

  /** `dias = null` devuelve el modulo al valor del servidor. */
  async fijarRetroactividad(modulo: ModuloRetro, dias: number | null): Promise<void> {
    const actual = { ...this.override() };
    if (dias === null) {
      delete actual[modulo];
    } else {
      const v = Math.trunc(dias);
      if (!Number.isInteger(v) || v < 0 || v > TOPE_VENTANA_DIAS) {
        throw new Error(`La ventana tiene que ser un número entre 0 y ${TOPE_VENTANA_DIAS}.`);
      }
      actual[modulo] = v;
    }
    this.override.set(actual);
    await this.config.set(KV.RETRO_OVERRIDE, JSON.stringify(actual));
  }

  /** Devuelve los cinco modulos a lo que diga el servidor. */
  async restaurarRetroactividad(): Promise<void> {
    this.override.set({});
    await this.config.set(KV.RETRO_OVERRIDE, JSON.stringify({}));
  }
}
