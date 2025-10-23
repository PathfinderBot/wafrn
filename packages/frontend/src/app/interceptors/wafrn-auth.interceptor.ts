import { Injectable } from '@angular/core'
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
  HttpContextToken
} from '@angular/common/http'
import { catchError, map, Observable, throwError } from 'rxjs'

import { Router } from '@angular/router'
import { EnvironmentService } from '../services/environment.service'

export const AUTH_OVERRIDE = new HttpContextToken(() => '')

@Injectable()
export class WafrnAuthInterceptor implements HttpInterceptor {
  constructor(private router: Router) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    let authReq = req
    const token = localStorage.getItem('authToken')
    const overrideToken = req.context.get(AUTH_OVERRIDE)

    const isApiRoute = req.url.indexOf(EnvironmentService.environment.baseUrl) !== -1 || req.url.startsWith('/api')
    if (isApiRoute) {
      if (overrideToken) {
        authReq = req.clone({ headers: req.headers.set('Authorization', `Bearer ${overrideToken}`) })
      } else if (token != null) {
        authReq = req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) })
      }
    }

    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          localStorage.clear()
          this.router.navigate(['/register'])
        }
        return throwError(() => error)
      })
    )
  }
}
