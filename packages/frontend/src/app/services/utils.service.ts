import { Injectable, inject } from '@angular/core'
import { PostsService } from './posts.service'
import { HttpClient } from '@angular/common/http'
import { firstValueFrom } from 'rxjs'
import { EnvironmentService } from './environment.service'

@Injectable({
  providedIn: 'root'
})
export class UtilsService {
  private postsService = inject(PostsService);
  private http = inject(HttpClient);


  objectToFormData(obj: any): FormData {
    const res = new FormData()
    Object.keys(obj).forEach((key: string) => {
      res.append(key, obj[key])
    })
    return res
  }

  async getSilencedPostIds(): Promise<string[]> {
    return this.postsService.silencedPostsIds
  }

  async getBlockedServers(): Promise<string[]> {
    const servers = await firstValueFrom(
      this.http.get<{ displayName: string }[]>(`${EnvironmentService.environment.baseUrl}/status/blocks`)
    )
    let result = servers.map((elem) => elem.displayName.toLowerCase().trim()).filter((elem) => elem != '')
    return result.sort()
  }

  async getBubbleServers(): Promise<string[]> {
    const servers = await firstValueFrom(
      this.http.get<{ displayName: string }[]>(`${EnvironmentService.environment.baseUrl}/status/bubble`)
    )
    let result = servers.map((elem) => elem.displayName.toLowerCase().trim()).filter((elem) => elem != '')
    return result.sort()
  }

  async getRawJsonUser(id: string): Promise<object> {
    const raw = await firstValueFrom(
      this.http.get(`${EnvironmentService.environment.frontUrl}/fediverse/blog/${id}`, {
        headers: {
          Accept: 'application/json'
        }
      })
    )
    return raw
  }

  async getRawJsonPost(id: string): Promise<object> {
    const raw = await firstValueFrom(
      this.http.get(`${EnvironmentService.environment.frontUrl}/fediverse/post/${id}/raw`, {
        headers: {
          Accept: 'application/json'
        }
      })
    )
    return raw
  }
}
