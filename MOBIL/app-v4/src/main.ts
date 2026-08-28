import { bootstrapApplication } from '@angular/platform-browser';
import { Capacitor } from '@capacitor/core';
import { defineCustomElements as defineJeepSqlite } from 'jeep-sqlite/loader';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

/**
 * En web (ionic serve / navegador) @capacitor-community/sqlite corre sobre
 * el custom element <jeep-sqlite> (sql.js + IndexedDB). En Android/iOS usa
 * SQLite nativo y este bloque no hace nada.
 */
async function prepararSqliteWeb(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') {
    return;
  }
  defineJeepSqlite(window);
  const el = document.createElement('jeep-sqlite');
  document.body.appendChild(el);
  await customElements.whenDefined('jeep-sqlite');
}

prepararSqliteWeb()
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => console.error('[bootstrap]', err));
