import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { unlinkedPosts } from '../interfaces/unlinked-posts'
import { PostsService } from './posts.service'
import { EnvironmentService } from './environment.service'
import { ProcessedPost } from '../interfaces/processed-post'
import { SimplifiedUser } from '../interfaces/simplified-user'
import { ActivatedRoute } from '@angular/router'

@Injectable({
  providedIn: 'root'
})
export class ForumService {
  private http = inject(HttpClient)
  private postService = inject(PostsService)

  async getForumThread(id: string) {
    let response: unlinkedPosts | undefined
    try {
      response = await firstValueFrom(
        this.http.get<unlinkedPosts>(EnvironmentService.environment.baseUrl + '/forum/' + id)
      )
    } catch (error) {
      return []
    }
    response.rewootIds?.forEach((id) => {
      this.postService.rewootedPosts().add(id)
    })

    let processed = this.postService.processPostNew(response)
    processed = processed.filter((post) => !this.postService.postContainsBlockedOrMuted(post, false))
    const tmpResult = processed.length ? processed.map((elem) => elem[elem.length - 1]) : []
    const reblogs = tmpResult
      .filter((elem) => elem.isReblog)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const realPosts = tmpResult
      .filter((elem) => !elem.isReblog)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const result: { post?: ProcessedPost; reblogs: SimplifiedUser[]; latestReblogCreatedAt?: Date }[] = [
      {
        reblogs: []
      },
      ...realPosts.map((elem) => {
        return { post: elem, reblogs: [] }
      })
    ]
    reblogs.forEach((elem) => {
      const postIndex = result.findIndex((realPost) => realPost.post?.id === elem.parentId)
      if (postIndex && result[postIndex]) {
        result[postIndex].reblogs.push(elem.user)
        result[postIndex].latestReblogCreatedAt = elem.createdAt
      } else if (window.location.href.split('/post/')[1] === elem.parentId) {
        result[0].reblogs.push(elem.user)
        result[0].latestReblogCreatedAt = elem.createdAt
      }
    })
    return result
  }
}
