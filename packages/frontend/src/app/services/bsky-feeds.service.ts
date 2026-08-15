import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'

import { BskyFeed, MyBskyFeed } from '../interfaces/bsky-feed'
import { EnvironmentService } from './environment.service'
import { MessageService } from './message.service'

@Injectable({
  providedIn: 'root'
})
export class BskyFeedsService {
  private http = inject(HttpClient)
  private messages = inject(MessageService)

  async searchFeeds(query: string): Promise<BskyFeed[]> {
    try {
      const params = new HttpParams().set('query', query)
      return await firstValueFrom(
        this.http.get<BskyFeed[]>(`${EnvironmentService.environment.baseUrl}/v2/bsky/search-feeds`, { params })
      )
    } catch (error) {
      console.error(error)
      this.messages.add({ severity: 'error', summary: 'messages.genericError', translate: true })
      return []
    }
  }

  getFeedAvatarUrl(feed: BskyFeed): string {
    const cacheDomain = EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : ''
    return `${cacheDomain}/api/v2/cache/bskyFeedAvatar/${encodeURIComponent(feed.uri)}`
  }

  async getMyFeeds(): Promise<MyBskyFeed[]> {
    try {
      return await firstValueFrom(
        this.http.get<MyBskyFeed[]>(`${EnvironmentService.environment.baseUrl}/v2/bsky/my-feeds`)
      )
    } catch (error) {
      console.error(error)
      return []
    }
  }

  async followFeed(feedUri: string): Promise<boolean> {
    return await this.postFeedAction('follow-feed', feedUri)
  }

  async unfollowFeed(feedUri: string): Promise<boolean> {
    return await this.postFeedAction('unfollow-feed', feedUri)
  }

  async unpinFeed(feedUri: string): Promise<boolean> {
    return await this.postFeedAction('unpin-feed', feedUri)
  }

  private async postFeedAction(action: 'follow-feed' | 'unfollow-feed' | 'unpin-feed', feedUri: string) {
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/v2/bsky/${action}`, {
          feedUri
        })
      )
      if (!response.success) {
        this.messages.add({ severity: 'error', summary: 'messages.genericError', translate: true })
      }
      return response.success
    } catch (error) {
      console.error(error)
      this.messages.add({ severity: 'error', summary: 'messages.genericError', translate: true })
      return false
    }
  }
}
