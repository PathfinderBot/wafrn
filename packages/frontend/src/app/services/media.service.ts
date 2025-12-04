import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { JwtService } from './jwt.service'
import { firstValueFrom } from 'rxjs'
import { EnvironmentService } from './environment.service'

@Injectable({
  providedIn: 'root'
})
export class MediaService {
  private jwt = inject(JwtService);
  private jwtService = inject(JwtService);
  private http = inject(HttpClient);
  private environmentService = inject(EnvironmentService);

  disableNSFWFilter = false
  constructor() {
    if (localStorage.getItem('disableNSFWFilter') === 'true' && this.jwtService.tokenValid() && this.isAdult()) {
      this.disableNSFWFilter = true
    }
  }

  changeDisableFilterValue(newVal: boolean) {
    this.disableNSFWFilter = newVal
    localStorage.setItem('disableNSFWFilter', newVal.toString().toLowerCase())
  }

  checkNSFWFilterDisabled(): boolean {
    return this.disableNSFWFilter
  }

  checkForceClassicAudioPlayer(): boolean {
    return localStorage.getItem('forceClassicAudioPlayer') === 'true'
  }

  checkForceClassicVideoPlayer(): boolean {
    return localStorage.getItem('forceClassicVideoPlayer') === 'true'
  }

  // if the user is logged out or logged in over 18
  isAdult(): boolean {
    const tokenData = this.jwt.getTokenData()
    if (tokenData === null) return true

    const birthDate = new Date(tokenData.birthDate)
    const minimumBirthDate = new Date()
    minimumBirthDate.setFullYear(minimumBirthDate.getFullYear() - 18)
    if (!birthDate) {
      return false
    }
    return minimumBirthDate > birthDate
  }

  async getLinkPreview(link: string): Promise<any> {
    try {
      return await firstValueFrom(
        this.http.get<any>(`${EnvironmentService.environment.baseUrl}/linkPreview/?url=${encodeURIComponent(link)}`)
      )
    } catch (error) {
      return {}
    }
  }
}
