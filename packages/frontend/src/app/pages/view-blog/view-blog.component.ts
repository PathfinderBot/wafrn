import {
  Component,
  OnDestroy,
  OnInit,
  signal,
  WritableSignal,
  inject,
  ChangeDetectorRef,
  ChangeDetectionStrategy
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { Meta } from '@angular/platform-browser'
import { ActivatedRoute, RouterModule } from '@angular/router'
import {
  faArrowUpRightFromSquare,
  faClockRotateLeft,
  faHeart,
  faHeartBroken,
  faHome,
  faReply,
  faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons'
import { asyncScheduler, firstValueFrom, Subject, Subscription, throttleTime } from 'rxjs'

import { MatTabChangeEvent, MatTabsModule } from '@angular/material/tabs'
import { HttpClient } from '@angular/common/http'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { MatMenuModule } from '@angular/material/menu'
import { TranslatePipe } from '@ngx-translate/core'
import { BlogHeaderComponent } from '../../components/blog-header/blog-header.component'
import { InfoCardComponent } from '../../components/info-card/info-card.component'
import { PagenotfoundComponent } from '../pagenotfound/pagenotfound.component'
import { PostListComponent } from '../../components/post-list/post-list.component'
import { SnappyHide, SnappyShow } from '../../components/snappy/snappy-life'
import { SnappyRouter, snappyInject } from '../../components/snappy/snappy-router.component'
import { SnappyBlogData } from '../../directives/blog-link/blog-link.directive'
import { BlogDetails } from '../../interfaces/blog-details'
import { ProcessedPost } from '../../interfaces/processed-post'
import { SimplifiedUser } from '../../interfaces/simplified-user'
import { BlocksService } from '../../services/blocks.service'
import { DashboardService } from '../../services/dashboard.service'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { SettingsService } from '../../services/settings.service'
import { SimpleDialogService } from '../../services/simple-dialog.service'
import { SimpleTitleService } from '../../services/simple-title.service'
import { ThemeService } from '../../services/theme.service'

@Component({
  selector: 'app-view-blog',
  imports: [
    CommonModule,
    RouterModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatButtonModule,
    FontAwesomeModule,
    MatMenuModule,
    BlogHeaderComponent,
    InfoCardComponent,
    PagenotfoundComponent,
    PostListComponent,
    MatTabsModule,
    TranslatePipe
  ],
  templateUrl: './view-blog.component.html',
  styleUrls: ['./view-blog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class ViewBlogComponent implements OnInit, OnDestroy, SnappyHide, SnappyShow {
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly dashboardService = inject(DashboardService)
  readonly loginService = inject(LoginService)
  private readonly metaTagService = inject(Meta)
  private readonly themeService = inject(ThemeService)
  readonly blockService = inject(BlocksService)
  private readonly snappy = inject(SnappyRouter)
  private settingService = inject(SettingsService)
  private simpleDialog = inject(SimpleDialogService)
  private simpleTitle = inject(SimpleTitleService)
  private http = inject(HttpClient)
  private cdr = inject(ChangeDetectorRef)

  loading = signal<boolean>(true)
  noMorePosts = false
  found = true
  viewedPosts = 0
  currentPage = 0
  posts: ProcessedPost[][] = []
  blogUrl: string = ''
  avatarUrl = ''
  blogDetails = signal<BlogDetails | undefined>(undefined)
  paramSubscription!: Subscription
  viewedPostsIds: string[] = []

  simpleUser?: SimplifiedUser
  useSimple = signal<boolean>(false)

  shareExternalIcon = faArrowUpRightFromSquare
  solidHeartIcon = faHeart
  clearHeartIcon = faHeartBroken
  reblogIcon = faReply
  quickReblogIcon = faClockRotateLeft
  reportIcon = faTriangleExclamation
  homeIcon = faHome

  scrollId!: number
  viewingPost!: WritableSignal<boolean>

  test = snappyInject(SnappyBlogData)

  // evil
  postsVisible = true
  mediaVisible = false
  activeTabName = signal<string>('blog.tabWoots')

  rateLimitLoadSubject = new Subject<void>()

  constructor() {
    this.rateLimitLoadSubject
      .pipe(throttleTime(5000, asyncScheduler, { leading: true, trailing: true }))
      .subscribe(() => {
        this.loadPosts(this.currentPage)
      })
  }

  snOnShow(): void {
    const blogDetails = this.blogDetails()
    if (blogDetails) {
      this.handleTheme(blogDetails)
    }
    this.postsVisible = true
  }

  snOnHide(): void {
    this.themeService.customCSS.set('')
    this.postsVisible = false
  }

  ngOnDestroy(): void {
    this.paramSubscription.unsubscribe()
  }

  async ngOnInit() {
    this.paramSubscription = this.activatedRoute.params.subscribe(() => {
      this.currentPage = 0
      this.blogUrl = ''
      this.avatarUrl = ''
      this.snappy.claim()

      let data = this.test(this.snappy)?.blog
      if (data?.url) {
        this.simpleUser = data
      }
      this.blogDetails.set(undefined)
      if (this.simpleUser) {
        const blogDetails = this.simpleToBlog(this.simpleUser)
        this.blogDetails.set(blogDetails)
        this.avatarUrl = this.getAvatarUrl(blogDetails)
        this.useSimple.set(true)
      }
      this.configureUser(true)
    })
  }

  private getAvatarUrl(blogDetails: BlogDetails): string {
    return (
      (EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : '') +
      '/api/v2/cache/avatar/' +
      blogDetails.id
    )
  }

  async configureUser(reload: boolean) {
    this.loading.set(true)

    const blogUrl = this.activatedRoute.snapshot.paramMap.get('url')
    if (blogUrl) {
      this.blogUrl = blogUrl
    }

    const blogResponse = await this.dashboardService.getBlogDetails(this.blogUrl).catch(() => {
      this.found = false
      this.loading.set(false)
    })

    this.useSimple.set(false)
    if (blogResponse) {
      const blogDetails = blogResponse
      this.blogDetails.set(blogDetails)
      this.avatarUrl = this.getAvatarUrl(blogResponse)

      this.simpleTitle.set(`${this.blogDetails()?.nameMarkdown ?? this.blogDetails()?.url}'s blog`)
      this.metaTagService.addTags([
        {
          name: 'description',
          content: `${this.blogDetails()!.url}'s wafrn blog`
        },
        { name: 'author', content: this.blogDetails()!.url },
        { name: 'image', content: this.avatarUrl }
      ])
      if (reload) {
        this.loading.set(false)
        this.reloadPosts()
      }
      this.useSimple.set(false)
      this.handleTheme(blogDetails)
    }
  }

  async handleTheme(blogDetails: BlogDetails) {
    const userHasCustomTheme = await this.themeExists(blogDetails.id)
    const userIsSelf = blogDetails.id === this.loginService.currentAccount()?.id
    if (!userHasCustomTheme || userIsSelf) return

    // Easiest case, they want custom CSS
    if (this.settingService.values().useOtherUserCustomThemes) {
      this.themeService.customCSS.set(blogDetails.id)
      return
    }

    // Check if we should ask
    if (!this.settingService.values().askToUseOtherUserCustomThemes) return

    const res = await this.simpleDialog.createCustomOptionDialog({
      title: 'dialog.blog.customThemeTitle',
      content: 'dialog.blog.customThemeDescription',
      options: {
        cancelRemember: { type: 'cancel', text: "No, don't ask again" },
        cancel: { type: 'cancel', text: 'No' },
        confirm: { type: 'confirm', text: 'Yes' }
      }
    })

    if (res === 'confirm') {
      this.settingService.values().useOtherUserCustomThemes = true
      this.settingService.forceUpdateValue([{ name: 'useOtherUserCustomThemes', value: 'true' }], false, false)
      this.themeService.customCSS.set(blogDetails.id)
    }
    if (res === 'cancelRemember') {
      this.settingService.values().askToUseOtherUserCustomThemes = false
      this.settingService.forceUpdateValue([{ name: 'useOtherUserCustomThemes', value: 'false' }], false, false)
    }
  }

  reloadPosts() {
    if (this.loading()) return
    this.posts = []
    this.currentPage = 0
    this.viewedPosts = 0
    this.viewedPostsIds = []
    const timeScrollStart = this.activatedRoute.snapshot.queryParams['startScrollDate']
    this.loadPosts(this.currentPage, undefined, true).then(() => this.loadPosts(this.currentPage, timeScrollStart))
  }

  rateLimitLoadPosts() {
    this.loading.set(true)
    this.rateLimitLoadSubject.next()
  }

  async themeExists(theme: string): Promise<boolean> {
    const res = await firstValueFrom(
      this.http.get(`${EnvironmentService.environment.baseUrl}/uploads/themes/${theme}.css`, {
        responseType: 'text'
      })
    )
    return res !== undefined && res.trim().length > 0
  }

  async loadPosts(page: number, timeScrollStart?: number, featured?: boolean) {
    if (!featured) {
      this.currentPage += 1
    }
    if (this.blogUrl === '' || !this.blogDetails()) {
      return
    }
    if (!this.loginService.loggedIn.value && this.blogDetails()!.url.startsWith('@') && !featured) {
      this.loading.set(false)
      this.noMorePosts = true
      return
    }

    this.loading.set(true)
    const currentTab = this.activeTabName()
    const tmpPosts = await this.dashboardService.getBlogPage(
      page,
      this.blogUrl,
      timeScrollStart,
      featured,
      currentTab == 'blog.tabMedia'
    )
    const filteredPosts = tmpPosts.filter((post: ProcessedPost[]) => {
      let allFragmentsSeen = true
      post.forEach((component) => {
        const thisFragmentSeen = this.viewedPostsIds.includes(component.id)
        allFragmentsSeen = thisFragmentSeen && allFragmentsSeen
        if (!thisFragmentSeen) {
          this.viewedPostsIds.push(component.id)
        }
      })
      return !allFragmentsSeen
    })
    this.posts = [...this.posts, ...filteredPosts]
    if (!featured) {
      this.loading.set(false)
    }
    if (tmpPosts.length === 0 && !featured) {
      this.noMorePosts = true
    }
    this.cdr.detectChanges()
  }

  private simpleToBlog(usr: SimplifiedUser): BlogDetails {
    return {
      id: usr.id,
      url: usr.url,
      name: usr.name,
      nameMarkdown: usr.nameMarkdown ?? usr.name,
      createdAt: '',
      description: '',
      descriptionMarkdown: '',
      remoteId: usr.remoteId ?? '',
      avatar: usr.avatar,
      federatedHostId: '',
      headerImage: '',
      followingCount: 0,
      followerCount: 0,
      manuallyAcceptsFollows: true,
      emojis: [],
      isBot: false,
      isAdmin: false,
      muted: false,
      blocked: false,
      serverBlocked: false,
      followed: 0,
      followers: 0,
      publicOptions: [],
      postCount: 0,
      isBlueskyUser: false,
      disableEmailNotifications: false,
      hideFollows: false,
      hideProfileNotLoggedIn: false
    }
  }
  handleTabChange(event: MatTabChangeEvent) {
    switch (event.index) {
      case 0:
        this.postsVisible = true
        this.mediaVisible = false
        this.activeTabName.set('blog.tabWoots')
        break
      case 1:
        this.postsVisible = false
        this.mediaVisible = true
        this.activeTabName.set('blog.tabMedia')
        break
    }
  }
}
