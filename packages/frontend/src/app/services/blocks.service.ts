import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'

import { MessageService } from './message.service'
import { EnvironmentService } from './environment.service'
import { SimpleDialogService } from './simple-dialog.service'
import { firstValueFrom } from 'rxjs'
import { UserBlockMute } from './admin.service'

@Injectable({
  providedIn: 'root'
})
export class BlocksService {
  baseMediaUrl = EnvironmentService.environment.baseMediaUrl
  baseCacheUrl = EnvironmentService.environment.externalCacheurl

  constructor(
    private http: HttpClient,
    private messages: MessageService,
    private simpleDialog: SimpleDialogService
  ) {}

  async promptBlockUser(id: string): Promise<Boolean> {
    const blockReason = await this.simpleDialog.createPromptDialog({
      title: 'dialog.post-header.blockAccountTitle',
      content: 'dialog.post-header.blockAccountDescription',
      label: 'dialog.post-header.blockAccountLabel',
      optional: true
    })

    if (!blockReason?.confirmed) return false

    return await this.blockUser(id, blockReason.value)
  }

  async blockUser(id: string, reason?: string): Promise<boolean> {
    console.log(reason)
    let success = false
    try {
      const formData = {
        userId: id,
        reason: reason
      }
      const response = await firstValueFrom(
        this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/block`, formData)
      )
      if (response?.success) {
        success = true
        this.messages.add({
          severity: 'success',
          summary: 'messages.blockUserSuccess',
          translate: true
        })
      }
    } catch (error) {
      console.error(error)
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
    return success
  }

  processResponse(serverResponse: Array<any>, key: string): UserBlockMute[] {
    return serverResponse.map((userBlocked) => {
      return {
        avatar: userBlocked[key].url.startsWith('@')
          ? this.baseCacheUrl + encodeURIComponent(userBlocked[key].avatar)
          : this.baseCacheUrl + encodeURIComponent(this.baseMediaUrl + userBlocked[key].avatar),
        url: userBlocked[key].url,
        reason: userBlocked.reason,
        id: userBlocked[key].id,
        createdAt: userBlocked.createdAt
      }
    })
  }
  async getBlockList(): Promise<UserBlockMute[]> {
    const response = await firstValueFrom(
      this.http.get<Array<any>>(`${EnvironmentService.environment.baseUrl}/myBlocks`)
    )
    return response ? this.processResponse(response, 'blocked') : []
  }

  async promptUnblockUser(id: string): Promise<UserBlockMute[] | undefined> {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.post-header.unblockAccountTitle',
      content: 'dialog.post-header.unblockAccountDescription'
    })

    if (!confirm) return undefined

    return await this.unblockUser(id)
  }

  async unblockUser(id: string): Promise<UserBlockMute[] | undefined> {
    const response = await firstValueFrom(
      this.http.post<Array<any>>(
        `${EnvironmentService.environment.baseUrl}/unblock-user?id=${encodeURIComponent(id)}`,
        {}
      )
    )
    if (response) {
      this.messages.add({
        severity: 'success',
        summary: 'messages.unblockUserSuccess',
        translate: true
      })
    }
    return response ? this.processResponse(response, 'blocked') : undefined
  }

  async promptMuteUser(id: string): Promise<Boolean> {
    const blockReason = await this.simpleDialog.createPromptDialog({
      title: 'dialog.post-header.muteAccountTitle',
      content: 'dialog.post-header.muteAccountDescription',
      label: 'dialog.post-header.muteAccountLabel',
      optional: true
    })

    if (!blockReason?.confirmed) return false

    return await this.muteUser(id, blockReason.value)
  }

  async muteUser(id: string, reason?: string): Promise<boolean> {
    let success = false
    try {
      const formData = {
        userId: id,
        reason: reason
      }
      const response = await this.http.post(`${EnvironmentService.environment.baseUrl}/mute`, formData).toPromise()
      this.messages.add({
        severity: 'success',
        summary: 'messages.muteUserSuccess',
        translate: true
      })

      success = true
    } catch (error) {
      console.error(error)
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
    return success
  }
  async getMuteList(): Promise<Array<any>> {
    const response = await this.http.get<Array<any>>(`${EnvironmentService.environment.baseUrl}/myMutes`).toPromise()
    return response ? this.processResponse(response, 'muted') : []
  }

  async promptUnmuteUser(id: string): Promise<UserBlockMute[] | undefined> {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.post-header.unmuteAccountTitle',
      content: 'dialog.post-header.unmuteAccountDescription'
    })

    if (!confirm) return undefined

    return await this.unmuteUser(id)
  }

  async unmuteUser(id: string): Promise<Array<any>> {
    const response = await this.http
      .post<Array<any>>(`${EnvironmentService.environment.baseUrl}/unmute-user?id=${encodeURIComponent(id)}`, {})
      .toPromise()
    if (response) {
      this.messages.add({
        severity: 'success',
        summary: 'messages.unmuteUserSuccess',
        translate: true
      })
    }
    return response ? this.processResponse(response, 'muted') : []
  }

  processResponseServer(response: any) {
    return response.map((elem: any) => {
      return {
        id: elem.blockedServer.id,
        displayName: elem.blockedServer.displayName
      }
    })
  }
  async blockServer(id: string): Promise<boolean> {
    let success = false
    try {
      const formData = {
        userId: id
      }
      const response = await this.http
        .post(`${EnvironmentService.environment.baseUrl}/blockUserServer`, formData)
        .toPromise()
      this.messages.add({
        severity: 'success',
        summary: 'messages.blockServerSuccess',
        translate: true
      })

      success = true
    } catch (error) {
      console.error(error)
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
    return success
  }
  async getMyServerBlockList(): Promise<Array<any>> {
    const response = await this.http
      .get<Array<any>>(`${EnvironmentService.environment.baseUrl}/myServerBlocks`)
      .toPromise()
    return response ? this.processResponseServer(response) : []
  }

  async unblockServer(id: string): Promise<Array<any>> {
    const response = await this.http
      .post<Array<any>>(`${EnvironmentService.environment.baseUrl}/unblockServer?id=${encodeURIComponent(id)}`, {})
      .toPromise()
    return response ? this.processResponseServer(response) : []
  }
}
