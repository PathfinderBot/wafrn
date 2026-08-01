import { Injectable } from '@angular/core'
import { TranslateLoader } from '@ngx-translate/core'
import { HttpClient } from '@angular/common/http'
import { Observable, forkJoin, of } from 'rxjs'
import { map, catchError } from 'rxjs/operators'
import buildData from '../../buildData.json'

// Custom TranslateLoader that provides fallback to English translations
@Injectable()
export class FallbackTranslateLoader implements TranslateLoader {
  private prefix = '/assets/i18n/'
  private suffix = `.json?v=${buildData.git.fullHash}`

  constructor(private http: HttpClient) {}

  getTranslation(lang: string): Observable<any> {
    // If requesting English, load it directly
    if (lang === 'en') {
      return this.http.get(`${this.prefix}en${this.suffix}`).pipe(catchError(() => of({})))
    }

    // Load both the requested language and English, then merge them
    return forkJoin({
      langTranslations: this.http.get(`${this.prefix}${lang}${this.suffix}`).pipe(catchError(() => of({}))),
      englishTranslations: this.http.get(`${this.prefix}en${this.suffix}`).pipe(catchError(() => of({})))
    }).pipe(
      map(({ langTranslations, englishTranslations }) => {
        // Merge: English as base, language-specific overrides
        return this.deepMerge(englishTranslations, langTranslations)
      })
    )
  }

  // I deeply regret this.
  private deepMerge(source: any, target: any): any {
    if (!target) return source
    if (!source) return target

    const result = { ...source }

    for (const key in target) {
      if (target.hasOwnProperty(key)) {
        if (
          typeof target[key] === 'object' &&
          target[key] !== null &&
          !Array.isArray(target[key]) &&
          typeof source[key] === 'object' &&
          source[key] !== null &&
          !Array.isArray(source[key])
        ) {
          result[key] = this.deepMerge(source[key], target[key])
        } else {
          result[key] = target[key]
        }
      }
    }

    return result
  }
}
