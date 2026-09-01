import { Injectable, inject } from '@angular/core';

import { BootstrapService } from '../bootstrap/bootstrap.service';
import { ClockService } from '../clock/clock.service';

/**
 * Política de fechas de captura (01-sincronizacion.md §Integridad de fechas
 * y 03-pantallas.md §Anexo). Todo "ahora" sale del reloj CORREGIDO por el
 * offset del servidor, nunca del reloj pelado del teléfono.
 *
 * Tres reglas, y una sola es dura:
 * - **Futuro: prohibido, sin interruptor.** `max` del selector es ahora.
 * - **Retroactivo más allá de la ventana**: permitido con interruptor y
 *   justificación escrita. Sin texto, no se guarda.
 * - **Fuera de la ventana horaria**: se avisa y se guarda igual. El criterio
 *   del usuario manda; el servidor lo anota con `fuera_de_ventana_horaria`.
 */

export type TipoFecha = 'am' | 'pm';

export interface EvaluacionFecha {
  /** Rechazo duro: I1 del servidor. La UI no debería llegar acá. */
  futuro: boolean;
  /** Más viejo que la ventana del módulo: exige justificación escrita. */
  excedeRetroactividad: boolean;
  /** Fuera del horario AM/PM: solo aviso. */
  fueraDeVentanaHoraria: boolean;
  ventana: { inicio: string; fin: string };
  diasRetroactividad: number;
}

@Injectable({ providedIn: 'root' })
export class FechaService {
  /** Tope del modo retroactivo. Más atrás no hay nada que capturar. */
  private static readonly TOPE_RETROACTIVO_DIAS = 400;

  private readonly clock = inject(ClockService);
  private readonly bootstrap = inject(BootstrapService);

  /** Valor inicial del selector: ahora corregido, en local sin offset. */
  ahoraLocal(): string {
    return this.aLocal(this.clock.ahoraCorregido());
  }

  /**
   * `min` / `max` para ion-datetime. `retroactivo` abre el rango hacia
   * atrás; el `max` NO cambia nunca: no se ofrecen fechas futuras.
   */
  limites(tipo: TipoFecha, retroactivo: boolean): { min: string; max: string } {
    const ahoraMs = this.clock.ahoraCorregidoMs();
    const dias = retroactivo
      ? FechaService.TOPE_RETROACTIVO_DIAS
      : this.diasRetroactividad(tipo);
    return {
      min: this.aLocal(new Date(ahoraMs - dias * 86400_000)),
      max: this.aLocal(new Date(ahoraMs)),
    };
  }

  diasRetroactividad(tipo: TipoFecha): number {
    return Number(this.bootstrap.datos().retroactividad_dias[tipo] ?? 0);
  }

  ventana(tipo: TipoFecha): { inicio: string; fin: string } {
    return this.bootstrap.datos().ventanas_horarias[tipo];
  }

  /** `local` es 'YYYY-MM-DDTHH:mm(:ss)' tal como lo devuelve ion-datetime. */
  evaluar(tipo: TipoFecha, local: string): EvaluacionFecha {
    const ventana = this.ventana(tipo);
    const dias = this.diasRetroactividad(tipo);
    const elegida = new Date(local).getTime();
    const ahora = this.clock.ahoraCorregidoMs();
    const hora = local.slice(11, 16);

    return {
      futuro: elegida > ahora + 60_000,
      excedeRetroactividad: ahora - elegida > dias * 86400_000,
      // Comparación de 'HH:mm' como texto: funciona porque el formato es
      // fijo y de ancho constante. Es la misma que hace el servidor.
      fueraDeVentanaHoraria: hora < ventana.inicio || hora > ventana.fin,
      ventana,
      diasRetroactividad: dias,
    };
  }

  /**
   * 'YYYY-MM-DDTHH:mm:ss' local -> ISO-8601 CON offset del dispositivo.
   *
   * No es opcional: `sync_fecha()` hace `new DateTime($valor)` y una cadena
   * sin offset la interpreta en la zona del SERVIDOR. Con el teléfono y el
   * servidor en zonas distintas, eso corre la hora de proceso sin que nadie
   * lo note. El offset se manda siempre.
   */
  conOffset(local: string): string {
    const base = local.length === 16 ? `${local}:00` : local.slice(0, 19);
    return `${base}${this.offsetTexto()}`;
  }

  /** Solo la fecha, 'YYYY-MM-DD'. Es la clave del espejo de asignaciones. */
  soloFecha(local: string): string {
    return local.slice(0, 10);
  }

  private aLocal(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
  }

  private offsetTexto(): string {
    const tz = -new Date().getTimezoneOffset();
    const signo = tz >= 0 ? '+' : '-';
    const a = Math.abs(tz);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${signo}${p(Math.floor(a / 60))}:${p(a % 60)}`;
  }
}
