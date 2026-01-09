import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { unlinkedPosts } from '../interfaces/unlinked-posts'
import { PostsService } from './posts.service'
import { EnvironmentService } from './environment.service'

@Injectable({
  providedIn: 'root'
})
export class ForumService {
  private http = inject(HttpClient);
  private postService = inject(PostsService);


  async getForumThread(id: string) {
    let response: unlinkedPosts | undefined
    try {
      response = await firstValueFrom(
        this.http.get<unlinkedPosts>(EnvironmentService.environment.baseUrl + '/forum/' + id)
      )
    } catch (error) {
      return []
    }
    
    console.log(response)
    response.rewootIds?.forEach((id) => {
      this.postService.rewootedPosts().add(id)
    })

    let processed = this.postService.processPostNew(response)
    processed = processed.filter((post) => !this.postService.postContainsBlockedOrMuted(post, false))
    let result = processed.length ? processed.map((elem) => elem[elem.length - 1]) : []
    result = result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return result
  }
}
