import { registerPlugin } from '@capacitor/core';

/**
 * Que interfaz esta usando el proceso para hablar con el servidor.
 *
 * `validada` es el `NET_CAPABILITY_VALIDATED` de Android: el sistema sondeo un
 * endpoint de Google y le contestaron. En la finca vale `false` SIEMPRE y eso
 * esta bien -- no tiene nada que ver con poder alcanzar el servidor de la LAN.
 * Se expone solo para el diagnostico, nunca para decidir si se envia.
 */
export interface EstadoLan {
  /** El proceso quedo atado a la WiFi/Ethernet. */
  atado: boolean;
  transporte: 'wifi' | 'ethernet' | 'celular' | 'ninguno' | 'otro';
  /** IPv4 del telefono en esa red, para el diagnostico en pantalla. */
  ip: string | null;
  validada: boolean;
  /** Por que no se pudo atar, cuando `atado` es false. */
  motivo: string | null;
}

export interface LanNetworkPlugin {
  /** Ata el proceso a la WiFi/Ethernet disponible. Idempotente. */
  asegurar(): Promise<EstadoLan>;
  /** Devuelve el proceso al ruteo por defecto del sistema. */
  soltar(): Promise<{ atado: boolean }>;
  /** Solo lee. No cambia el ruteo. */
  estado(): Promise<EstadoLan>;
}

/**
 * En el navegador no hay nada que atar: el ruteo lo maneja el SO y la app
 * corre en `ng serve` o en Playwright. El fallback existe para que las suites
 * e2e y el build web no se caigan con "plugin not implemented".
 */
const SIN_SOPORTE: EstadoLan = {
  atado: false,
  transporte: 'otro',
  ip: null,
  validada: true,
  motivo: 'Sin plugin nativo (navegador)',
};

const web: LanNetworkPlugin = {
  asegurar: async () => SIN_SOPORTE,
  soltar: async () => ({ atado: false }),
  estado: async () => SIN_SOPORTE,
};

export const LanNetwork = registerPlugin<LanNetworkPlugin>('LanNetwork', {
  web: async () => web,
});
