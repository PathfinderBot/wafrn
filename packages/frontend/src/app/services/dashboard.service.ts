import { HttpClient, HttpParams } from '@angular/common/http'
import { EventEmitter, Injectable, inject } from '@angular/core'

import { ProcessedPost } from '../interfaces/processed-post'
import { SimplifiedUser } from '../interfaces/simplified-user'
import { PostsService } from './posts.service'
import { PostRenderingService } from './post-rendering.service'
import { UserOptionsService } from './user-options.service'
import { MessageService } from './message.service'
import { firstValueFrom } from 'rxjs'
import { unlinkedPosts } from '../interfaces/unlinked-posts'
import { Emoji } from '../interfaces/emoji'
import { BlogDetails } from '../interfaces/blog-details'
import { Ask } from '../interfaces/ask'
import { EnvironmentService } from './environment.service'

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private http = inject(HttpClient)
  private postService = inject(PostsService)
  private postRenderingService = inject(PostRenderingService)
  private userOptionsService = inject(UserOptionsService)
  private messageService = inject(MessageService)

  public scrollEventEmitter: EventEmitter<string> = new EventEmitter()
  // TODO improve this. will require some changes for stuff but basically
  // its faster to say "gimme page 0 startdate this" than "gime page 2 startdate this"
  public startScrollDate: Date = new Date()
  // Bluesky feeds need cursor because fuck timestamps
  private bskyCursor?: string
  baseUrl: string

  constructor() {
    this.baseUrl = EnvironmentService.environment.baseUrl
  }

  async getDashboardPage(date: Date, level: number, page?: number, feedUri?: string): Promise<ProcessedPost[][]> {
    this.userOptionsService.loadFollowers()
    let result: ProcessedPost[][] = []
    let petitionData: HttpParams = new HttpParams()
    this.startScrollDate = date
    petitionData = petitionData.set('page', page ? page.toString() : '0')
    petitionData = petitionData.set('level', level)
    petitionData = petitionData.set('startScroll', date.getTime().toString())
    if (feedUri) {
      petitionData = petitionData.set('feedUri', feedUri)
    }
    if (level === 40) {
      if (page === -1) {
        // page -1 means "start over" (see loadPosts), so any old cursor is stale
        this.bskyCursor = undefined
      } else if (this.bskyCursor) {
        petitionData = petitionData.set('bskyCursor', this.bskyCursor)
      }
    }
    const url = `${EnvironmentService.environment.baseUrl}/v2/dashboard`
    const dashboardPetition = await firstValueFrom(
      this.http.get<unlinkedPosts>(url, {
        params: petitionData
      })
    )
    if (level === 40) {
      this.bskyCursor = dashboardPetition.bskyCursor
    }
    result = this.postRenderingService.processPostNew(dashboardPetition)
    result = result.filter((post) => !this.postRenderingService.postContainsBlockedOrMuted(post, true))
    dashboardPetition.rewootIds.forEach((id) => {
      this.postService.rewootedPosts().add(id)
    })
    // Remove in the future because we got the websocket!
    this.scrollEventEmitter.emit('scrollingtime')
    // this is a bit dirty but fuck it. price to pay for nuking zonejs
    // god i only do these things on my dayjob
    return result
  }

  async getSearchPage(
    page: number,
    term: string,
    options?: { user: string | undefined }
  ): Promise<{ posts: ProcessedPost[][]; users: SimplifiedUser[] }> {
    let postResult: ProcessedPost[][] = []
    if (page === 0) {
      //if we are starting the scroll, we store the current date
      this.startScrollDate = new Date()
    }
    let petitionData: HttpParams = new HttpParams()
    petitionData = petitionData.set('page', page.toString())
    petitionData = petitionData.set('startScroll', this.startScrollDate.getTime().toString())
    petitionData = petitionData.set('term', term)
    if (options?.user) {
      petitionData = petitionData.set('user', options.user)
    }
    const dashboardPetition: {
      posts: unlinkedPosts
      foundUsers: Array<SimplifiedUser>
    } = await firstValueFrom(
      this.http.get<{
        posts: unlinkedPosts
        foundUsers: Array<SimplifiedUser>
      }>(`${EnvironmentService.environment.baseUrl}/v2/search`, {
        params: petitionData
      })
    )
    if (dashboardPetition) {
      postResult = this.postRenderingService.processPostNew(dashboardPetition.posts)
      postResult = postResult.filter((post) => !this.postRenderingService.postContainsBlockedOrMuted(post, false))
    } else {
      // TODO show error message
      this.messageService.add({
        severity: 'error',
        summary: 'Something went wrong :('
      })
    }

    return {
      posts: postResult,
      users: dashboardPetition?.foundUsers ? dashboardPetition?.foundUsers : []
    }
  }

  async manageHashtagSubscription(tag: string, subscribe = true): Promise<boolean> {
    const url = `${EnvironmentService.environment.baseUrl}/${subscribe ? 'followHashtag' : 'unfollowHashtag'}`
    let success = false
    try {
      const petition = await firstValueFrom(this.http.post<{ success: boolean }>(url, { hashtag: tag }))
      success = petition.success
    } catch (error) {
      console.error(error)
      this.messageService.add({
        severity: 'error',
        summary: 'Something went wrong!'
      })
    }
    return success
  }

  async getBlogPage(
    page: number,
    blogId: string,
    startScrollDate?: number,
    featured?: boolean,
    mediaOnly?: boolean
  ): Promise<ProcessedPost[][]> {
    let result: ProcessedPost[][] = []
    if (page === 0) {
      //if we are starting the scroll, we store the current date
      this.startScrollDate = new Date(startScrollDate ? parseInt(startScrollDate.toString()) : new Date().getTime())
    }
    let petitionData: HttpParams = new HttpParams()
    petitionData = petitionData.set('page', page.toString())
    petitionData = petitionData.set('mediaOnly', mediaOnly == true)
    petitionData = petitionData.set('startScroll', this.startScrollDate.getTime().toString())
    petitionData = petitionData.set('id', blogId)
    if (featured) {
      petitionData = petitionData.set('featured', true)
    }
    const dashboardPetition: unlinkedPosts = await firstValueFrom(
      this.http.get<unlinkedPosts>(`${EnvironmentService.environment.baseUrl}/v2/blog`, {
        params: petitionData
      })
    )
    if (dashboardPetition) {
      result = this.postRenderingService.processPostNew(dashboardPetition)
      this.startScrollDate = new Date(
        Math.min(...result.map((elem) => new Date(elem[elem.length - 1].createdAt).getTime())) - 1
      )
      if (result.length === 0) {
        this.startScrollDate = new Date(0)
      }
      result = result.filter((post) => !this.postRenderingService.postContainsBlockedOrMuted(post, false))
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Something went wrong :('
      })
    }
    return result
  }

  async getBlogDetails(url: string, ignoreEmojis = false) {
    let petitionData: HttpParams = new HttpParams()
    petitionData = petitionData.append('id', url)
    const res: BlogDetails = await firstValueFrom(
      this.http.get<BlogDetails>(`${EnvironmentService.environment.baseUrl}/user`, { params: petitionData })
    )
    res.name = res.name.replaceAll('‏', '')
    res.nameMarkdown = res.name
    if (res.emojis && !ignoreEmojis) {
      res.emojis.forEach((emoji: Emoji) => {
        res.name = res.name.replaceAll(emoji.name, this.postRenderingService.emojiToHtml(emoji))
        res.description = res.description.replaceAll(emoji.name, this.postRenderingService.emojiToHtml(emoji))
      })
    }
    return res
  }

  async getArticle(slug: string, userUrl?: string): Promise<ProcessedPost[]> {
    const petition = await firstValueFrom(
      this.http.get<unlinkedPosts>(`${this.baseUrl}/article/${userUrl ? `${userUrl}/` : ''}${slug}`)
    )

    const result = this.postRenderingService.processPostNew(petition)

    return result[0]
  }

  async getPostV2(id: string): Promise<ProcessedPost[]> {
    const petition = await firstValueFrom(this.http.get<unlinkedPosts>(`${this.baseUrl}/v2/post/${id}`))

    const result = this.postRenderingService.processPostNew(petition)

    return result[0]
  }

  async getMyAsks(): Promise<Ask[]> {
    const petition = await firstValueFrom(
      this.http.get<{
        users: SimplifiedUser[]
        asks: {
          userAsker: string
          question: string
          apObject: string
          id: string
        }[]
      }>(`${this.baseUrl}/user/myAsks`)
    )

    return petition.asks.map((ask) => {
      return {
        ...ask,
        user: petition.users.find((usr) => usr.id == ask.userAsker)
      }
    })
  }

  public getAvatarUrl(blog?: BlogDetails) {
    if (!blog) return ''
    const res =
      (EnvironmentService.environment ? EnvironmentService.environment.cacheDomain : '') +
      '/api/v2/cache/avatar/' +
      blog.id
    return res
  }
}
