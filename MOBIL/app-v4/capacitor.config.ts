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
  },
  // Sin cleartext: TLS obligatorio (MOBIL/02-bd-y-api.md §8).
  // Para desarrollo contra el Docker local usar `ionic serve` en navegador
  // o un flavor de desarrollo separado; nunca abrir cleartext en el release.
};

export default config;
