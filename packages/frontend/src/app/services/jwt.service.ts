import { Injectable, inject } from '@angular/core'
import { Router } from '@angular/router'

export type JwtTokenDecoded = {
  userId: string
  email: string
  birthDate: string
  url: string
  role: number | string
  exp: number
}

@Injectable({
  providedIn: 'root'
})
export class JwtService {
  private router = inject(Router)

  // you're fully logged in
  // don't ask me why this is a duplicate -FireIsGood
  tokenValid(): boolean {
    return this.tokenPartialValid()
  }

  // you're partially logged in, e.g. you still need to complete MFA.
  tokenPartialValid(): boolean {
    let res = false
    const tokenString = localStorage.getItem('authToken')
    if (tokenString) {
      const token = this.decodeToken(tokenString)
      res = new Date().getTime() < token.exp * 1000
      if (!res) {
        localStorage.clear()
      }
    }
    return res
  }

  adminToken(): boolean {
    const res = false
    if (this.tokenValid()) {
      return this.getTokenData()?.role == 10
    }
    return res
  }

  public decodeToken(token: string): JwtTokenDecoded {
    const jwtData = token.split('.')[1]
    return JSON.parse(window.atob(jwtData))
  }

  getTokenData(): JwtTokenDecoded | null {
    const tokenString = localStorage.getItem('authToken')
    if (!tokenString) return null

    return this.decodeToken(tokenString)
  }
}
