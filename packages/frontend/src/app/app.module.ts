import { NgModule, inject, isDevMode, provideAppInitializer } from '@angular/core'
import { BrowserModule } from '@angular/platform-browser'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { HTTP_INTERCEPTORS, provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http'
import { CommonModule } from '@angular/common'
import { AppRoutingModule } from './app-routing.module'
import { AppComponent } from './app.component'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { WafrnAuthInterceptor } from './interceptors/wafrn-auth.interceptor'
import { ServiceWorkerModule } from '@angular/service-worker'
import { MAT_RIPPLE_GLOBAL_OPTIONS, MatNativeDateModule, RippleGlobalOptions } from '@angular/material/core'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { MatSnackBarModule } from '@angular/material/snack-bar'
import { TranslateLoader, TranslateModule, TranslateService } from '@ngx-translate/core'
import { HttpClient } from '@angular/common/http'
import { HotkeyManagerComponent } from './components/hotkey-manager/hotkey-manager.component'
import buildData from '../buildData.json'
import { ThemeManagerComponent } from './components/theme-manager/theme-manager.component'
import { catchError, of, switchMap, tap } from 'rxjs'
import { EnvironmentService } from './services/environment.service'
import { supportedLanguages, type SupportedLanguage } from './lists/languages'
import { FallbackTranslateLoader } from './loaders/fallback-translate.loader'

const globalRippleConfig: RippleGlobalOptions = {
  disabled: true,
  animation: {
    enterDuration: 300,
    exitDuration: 0
  }
}
@NgModule({
  bootstrap: [AppComponent],
  exports: [],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppRoutingModule,
    MatNativeDateModule,
    AppComponent,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 5 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:5000'
    }),
    FontAwesomeModule,
    MatSnackBarModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: FallbackLoaderFactory,
        deps: [HttpClient]
      }
    }),
    ThemeManagerComponent,
    HotkeyManagerComponent
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: WafrnAuthInterceptor, multi: true },
    { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: globalRippleConfig },
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    provideAppInitializer(() => {
      const http = inject(HttpClient)
      const environmentService = inject(EnvironmentService)
      const translateService = inject(TranslateService)

      const langs = [...supportedLanguages]
      translateService.addLangs(langs)
      translateService.setDefaultLang('en')

      const userLanguage = typeof localStorage !== 'undefined' ? localStorage.getItem('appLanguage') : null
      const isSupportedLanguage = (lang: string | null): lang is SupportedLanguage =>
        typeof lang === 'string' && langs.includes(lang as SupportedLanguage)
      const languageToUse = isSupportedLanguage(userLanguage)
        ? userLanguage
        : (translateService.getDefaultLang() as SupportedLanguage)
      document.documentElement.lang = languageToUse

      return translateService.use(languageToUse).pipe(
        catchError((error) => {
          console.error('Translation load failed; falling back to default language', error)
          return of(null)
        }),
        switchMap(() => http.get('/api/environment')),
        tap((data: any) => {
          environmentService.replaceEnvironment(data)
        })
      )
    })
  ]
})
export class AppModule {}

export function FallbackLoaderFactory(http: HttpClient): FallbackTranslateLoader {
  return new FallbackTranslateLoader(http)
}
