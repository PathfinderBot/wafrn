import { Injectable, signal, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { firstValueFrom, lastValueFrom, Subject } from 'rxjs'
import { Emoji } from '../interfaces/emoji'
import { MessageService } from './message.service'
import { EnvironmentService } from './environment.service'
import { SimpleDialogService } from './simple-dialog.service'
import { UserOptionsService } from './user-options.service'
@Injectable({
  providedIn: 'root'
})
export class PostsService {
  private http = inject(HttpClient)
  private messageService = inject(MessageService)
  private simpleDialogService = inject(SimpleDialogService)
  private userOptionsService = inject(UserOptionsService)

  public postLiked = new Subject<{ id: string; like: boolean }>()

  public emojiReacted = new Subject<{
    postId: string
    emoji: Emoji
    type: 'react' | 'undo_react'
  }>()

  public rewootedPosts = signal(new Set<string>(), { equal: () => false })

  async likePost(id: string): Promise<boolean> {
    let res = false
    const payload = {
      postId: id
    }
    try {
      const response = await this.http
        .post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/like`, payload)
        .toPromise()
      await this.userOptionsService.loadFollowers()
      res = response?.success === true
    } catch (exception: any) {
      console.error(exception)
      if (exception.error?.message) {
        this.simpleDialogService.createConfirmDialog({
          title: 'Error',
          content: exception.error.message,
          options: {
            confirm: 'ok'
          }
        })
      }
    }
    if (res) {
      this.postLiked.next({
        id: id,
        like: true
      })
    }
    return res
  }

  async unlikePost(id: string): Promise<boolean> {
    let res = false
    const payload = {
      postId: id
    }
    try {
      const response = await this.http
        .post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/unlike`, payload)
        .toPromise()
      await this.userOptionsService.loadFollowers()
      res = response?.success === true
    } catch (exception) {
      console.error(exception)
    }
    if (res) {
      this.postLiked.next({
        id: id,
        like: false
      })
    }
    return res
  }

  async bookmarkPost(id: string): Promise<boolean> {
    let res = false
    const payload = {
      postId: id
    }
    try {
      const response = await this.http
        .post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/user/bookmarkPost`, payload)
        .toPromise()
      await this.userOptionsService.loadFollowers()
      res = response?.success === true
    } catch (exception) {
      console.error(exception)
    }
    return res
  }

  async unbookmarkPost(id: string): Promise<boolean> {
    let res = false
    const payload = {
      postId: id
    }
    try {
      const response = await this.http
        .post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/user/unbookmarkPost`, payload)
        .toPromise()
      await this.userOptionsService.loadFollowers()
      res = response?.success === true
    } catch (exception) {
      console.error(exception)
    }
    return res
  }

  async pinPost(id: string): Promise<boolean> {
    let res = false
    const payload = {
      postId: id
    }
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/user/pinPost`, payload)
      )
      res = response?.success === true
    } catch (exception) {
      console.error(exception)
    }
    return res
  }

  async emojiReactPost(postId: string, emojiName: string, undo = false): Promise<boolean> {
    let res = false
    const payload = {
      postId: postId,
      emojiName: emojiName,
      undo: undo
    }
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/emojiReact`, payload)
      )
      await this.userOptionsService.loadFollowers()
      res = response?.success === true
    } catch (exception) {
      console.error(exception)
    }
    if (res) {
      let allEmojis: Emoji[] = []
      this.userOptionsService.emojiCollections.forEach((col) => (allEmojis = allEmojis.concat(col.emojis)))
      const emoji = allEmojis.find((elem) => elem.name === emojiName || elem.id === emojiName) as Emoji | undefined
      if (emoji) {
        const emojiIsUnicode = emoji.url.length === 0
        this.emojiReacted.next({
          type: undo ? 'undo_react' : 'react',
          postId: postId,
          emoji: emojiIsUnicode ? this.convertUnicodeEmoji(emoji) : emoji
        })
      }
    }

    return res
  }

  convertUnicodeEmoji(unicodeEmoji: Emoji): Emoji {
    return {
      id: '',
      name: unicodeEmoji.id,
      url: '',
      external: unicodeEmoji.external,
      uuid: unicodeEmoji.id
    }
  }

  async loadRepliesFromFediverse(id: string) {
    return await this.http.get(`${EnvironmentService.environment.baseUrl}/loadRemoteResponses?id=${id}`).toPromise()
  }

  async unsilencePost(postId: string): Promise<boolean> {
    const payload = {
      postId: postId
    }
    const response = await firstValueFrom(
      this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/v2/unsilencePost`, payload)
    )
    await this.userOptionsService.loadFollowers()
    return response.success
  }

  async silencePost(postId: string, superMute = false): Promise<boolean> {
    const payload = {
      postId: postId,
      superMute: superMute.toString().toLowerCase()
    }
    const response = await firstValueFrom(
      this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/v2/silencePost`, payload)
    )
    await this.userOptionsService.loadFollowers()
    return response.success
  }

  async voteInPoll(pollId: number, votes: number[]) {
    let res = false
    const payload = {
      votes: votes
    }
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; message?: string }>(
          `${EnvironmentService.environment.baseUrl}/v2/pollVote/${pollId}`,
          payload
        )
      )
      res = response.success
      this.messageService.add({
        severity: res ? 'success' : 'error',
        summary: response.message
          ? response.message
          : res
            ? 'You voted succesfuly. It can take some time to display'
            : 'Something went wrong'
      })
    } catch (error) {
      console.error(error)
      this.messageService.add({
        severity: 'error',
        summary: 'Something went wrong'
      })
    }
    return res
  }

  async forceRefederate(postId: string) {
    const res = await firstValueFrom(
      this.http.post(`${EnvironmentService.environment.baseUrl}/refederatePost`, {
        postId: postId
      })
    )
    this.userOptionsService.loadFollowers()
    return res
  }

  async bitePost(id: string): Promise<boolean> {
    let res = false
    const payload = {
      postId: id
    }

    try {
      const response = await lastValueFrom(
        this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/bitePost`, payload)
      )

      await this.userOptionsService.loadFollowers()
      res = response?.success === true
    } catch (exception) {
      console.error(exception)
    }

    return res
  }
}
