import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { firstValueFrom, map } from 'rxjs'
import { environment } from '../../environments/environment'

@Injectable({
  providedIn: 'root'
})
export class EnvironmentService {
  private http = inject(HttpClient)

  // default env
  public static environment: any = { ...environment }

  constructor() {}

  replaceEnvironment(newEnv: Record<string, string | number | boolean>) {
    for (const key in newEnv) {
      if (newEnv[key] !== undefined) {
        EnvironmentService.environment[key] = newEnv[key]
      }
    }
  }
}
