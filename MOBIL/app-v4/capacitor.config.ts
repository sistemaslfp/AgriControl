import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Id propio: la app vieja era io.ionic.starter (el default del starter).
  appId: 'ec.lifprodecsa.lagricontrol',
  appName: 'LAgricontrol',
  webDir: 'www',
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      androidIsEncryption: false,
    },
    // La app corre en `https://localhost` (esquema por defecto de Capacitor
    // en Android). Sin esto, un fetch/XHR de la propia app a un backend
    // `http://` -- el Docker/CI3 de pruebas -- lo bloquea el WebView como
    // Mixed Content, ANTES de que el cleartext del manifest importe: son dos
    // capas de seguridad distintas (Mixed Content es del motor de paginas,
    // el manifest es del SO). Con CapacitorHttp la peticion sale por el
    // puente nativo (Java), no por el WebView, asi que no pisa Mixed
    // Content -- y ahi si queda sujeta al `network_security_config` de
    // src/debug/ (192.168.2.63 nada mas). El release sigue exigiendo TLS
    // (02-bd-y-api.md Seccion 8): ese host solo esta permitido en debug.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
