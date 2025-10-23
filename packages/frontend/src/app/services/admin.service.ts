import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'

import { server } from '../interfaces/servers'
import { firstValueFrom } from 'rxjs'
import { SimplifiedUser } from '../interfaces/simplified-user'
import { statsReply } from '../interfaces/statsReply'
import { EnvironmentService } from './environment.service'

export type UserReport = {
  id: number
  resolved: boolean
  severity: number
  description: string
  userId: string
  user: SimplifiedUser
  postId: string
  post: string
  reportedUserId: string
  reportedUser: SimplifiedUser
  createdAt: string
}

export type AdminUserBlock = {
  blockedId: string
  blocked: {
    avatar: string
    url: string
  }
  blockerId: string
  blocker: {
    avatar: string
    url: string
  }
  bskyPath: string | null
  remoteBlockId: string | null
  reason: string | null
  createdAt: string
}

export type ServerBlock = {
  blockedServerId: string
  blockedServer: {
    displayName: string
  }
  userBlockerId: string
  userBlocker: {
    avatar: string
    url: string
  }
  createdAt: string
}

export type UserBan = {
  id: string | null
  avatar: string | null
  url: string | null
}

export type AdminUserBlocks = {
  userBlocks: AdminUserBlock[]
  userServerBlocks: ServerBlock[]
}

// Either a block or a mute (same type)
export type UserBlockMute = {
  avatar: string
  id: string
  reason: string
  url: string
  createdAt: string
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  constructor(private http: HttpClient) {}

  async getServers(): Promise<server[]> {
    const response = await firstValueFrom(
      this.http.get<{ servers: server[] }>(`${EnvironmentService.environment.baseUrl}/admin/server-list`)
    )
    return response?.servers ? response?.servers : []
  }

  async updateServers(serversToUpdate: server[]) {
    const response = await firstValueFrom(
      this.http.post(`${EnvironmentService.environment.baseUrl}/admin/server-update`, serversToUpdate)
    )
    return response
  }

  async getBlocks(): Promise<any> {
    const response = await firstValueFrom(
      this.http.get(`${EnvironmentService.environment.baseUrl}/admin/userBlockList`)
    )
    return response
  }

  async getReports(): Promise<UserReport[]> {
    return firstValueFrom(this.http.get<UserReport[]>(`${EnvironmentService.environment.baseUrl}/admin/reportList`))
  }

  async ignoreReport(id: number): Promise<any> {
    return firstValueFrom(this.http.post(`${EnvironmentService.environment.baseUrl}/admin/ignoreReport`, { id: id }))
  }

  async banUser(id: string, message: string | null) {
    return firstValueFrom(
      this.http.post(`${EnvironmentService.environment.baseUrl}/admin/banUser`, { id: id, message: message })
    )
  }

  async forceNSFWUser(id: string) {
    return firstValueFrom(this.http.post(`${EnvironmentService.environment.baseUrl}/admin/forceNSFWUser`, { id: id }))
  }

  async banList() {
    return firstValueFrom(
      this.http.get<{ users: UserBan[] }>(`${EnvironmentService.environment.baseUrl}/admin/getBannedUsers`)
    )
  }
  async unbanUser(id: string) {
    return firstValueFrom(
      this.http.post<{ users: UserBan[] }>(`${EnvironmentService.environment.baseUrl}/admin/unbanUser`, { id: id })
    )
  }

  async getPendingActivationUsers(): Promise<SimplifiedUser[]> {
    return firstValueFrom(
      this.http.get<SimplifiedUser[]>(`${EnvironmentService.environment.baseUrl}/admin/getPendingApprovalUsers`)
    )
  }

  async requireExtraSteps(id: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${EnvironmentService.environment.baseUrl}/admin/notActivateAndSendEmail`, {
        id
      })
    )
  }

  async userUsedVPN(id: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${EnvironmentService.environment.baseUrl}/admin/userUsedVPN`, {
        id
      })
    )
  }

  async activateUser(id: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${EnvironmentService.environment.baseUrl}/admin/activateUser`, {
        id
      })
    )
  }

  async getStats(): Promise<statsReply> {
    return firstValueFrom(this.http.get<statsReply>(`${EnvironmentService.environment.baseUrl}/status/workerStats`))
  }
}
