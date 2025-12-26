import { enableProdMode, provideZoneChangeDetection } from '@angular/core'
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic'

import { AppModule } from './app/app.module'
import { environment } from './environments/environment'
import selfXssWarning from './environments/selfXssWarning'

if (environment.production) {
  enableProdMode()
}

function bootstrap() {
  platformBrowserDynamic()
    .bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection()], })
    .catch((err) => console.error(err))
}

if (document.readyState === 'complete') {
  bootstrap()
} else {
  document.addEventListener('DOMContentLoaded', bootstrap)
}

selfXssWarning()
