import { CommonModule } from '@angular/common'
import { Component, inject, model, OnDestroy, OnInit, signal, ChangeDetectionStrategy } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator'
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faHome, faRepeat } from '@fortawesome/free-solid-svg-icons'
import { TranslatePipe } from '@ngx-translate/core'
import { Subscription } from 'rxjs'
import { filter } from 'rxjs/operators'
import { BottomReplyBarComponent } from '../../components/bottom-reply-bar/bottom-reply-bar.component'
import { LoaderComponent } from '../../components/loader/loader.component'
import { PostFragmentComponent } from '../../components/post-fragment/post-fragment.component'
import { PostRibbonComponent } from '../../components/post-ribbon/post-ribbon.component'
import { PostHeaderComponent } from '../../components/post/post-header/post-header.component'
import { PostComponent } from '../../components/post/post.component'
import { SnappyCreate } from '../../components/snappy/snappy-life'
import { SnappyRouter, snappyInject } from '../../components/snappy/snappy-router.component'
import { BlogLinkDirective } from '../../directives/blog-link/blog-link.directive'
import { PostLinkDirective, SnappyPostData } from '../../directives/post-link/post-link.directive'
import { ProcessedPost } from '../../interfaces/processed-post'
import { SimplifiedUser } from '../../interfaces/simplified-user'
import { DashboardService } from '../../services/dashboard.service'
import { EnvironmentService } from '../../services/environment.service'
import { ForumService } from '../../services/forum.service'
import { LoginService } from '../../services/login.service'
import { PostsService } from '../../services/posts.service'
import { SimpleTitleService } from '../../services/simple-title.service'

@Component({
  selector: 'app-forum-component',
  imports: [
    CommonModule,
    RouterModule,
    PostFragmentComponent,
    LoaderComponent,
    MatCardModule,
    MatButtonModule,
    PostHeaderComponent,
    PostComponent,
    FontAwesomeModule,
    MatPaginatorModule,
    BottomReplyBarComponent,
    PostRibbonComponent,
    PostLinkDirective,
    BlogLinkDirective,
    TranslatePipe
  ],
  templateUrl: './forum.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './forum.component.scss'
})
export class ForumComponent implements OnInit, OnDestroy, SnappyCreate {
  private forumService = inject(ForumService)
  readonly loginService = inject(LoginService)
  private postService = inject(PostsService)
  private readonly dashboardService = inject(DashboardService)
  private readonly router = inject(Router)
  private readonly snappy = inject(SnappyRouter)
  private simpleTitle = inject(SimpleTitleService)

  loading = true
  forumPosts = signal<{ post?: ProcessedPost; reblogs: SimplifiedUser[]; latestReblogCreatedAt?: Date }[]>([])
  post = model<ProcessedPost[]>([])
  postId = model<string>('')
  snappyPost = snappyInject(SnappyPostData)
  hasPost = false
  subscription!: Subscription
  updateFollowsSubscription: Subscription
  navigationStart!: Subscription
  myId = ''
  notYetAcceptedFollows: string[] = []
  followedUsers: string[] = []
  localUrl = EnvironmentService.environment.frontUrl

  // evil
  findReply = (id: string | undefined) => {
    return this.forumPosts().find((post) => post.post?.id === id) ?? this.post().find((post) => post.id === id)
  }

  // local pagination
  currentPage = 0
  itemsPerPage = 50

  // icons
  rewootIcon = faRepeat
  private readonly route = inject(ActivatedRoute)
  homeIcon = faHome
  constructor() {
    this.followedUsers = this.postService.followedUserIds
    this.notYetAcceptedFollows = this.postService.notYetAcceptedFollowedUsersIds
    this.updateFollowsSubscription = this.postService.updateFollowers.subscribe(() => {
      this.followedUsers = this.postService.followedUserIds
      this.notYetAcceptedFollows = this.postService.notYetAcceptedFollowedUsersIds
    })
    this.postService.loadFollowers()
  }

  snOnCreate(): void {
    const data = this.snappyPost(this.snappy)?.post
    if (!data) return

    let post: ProcessedPost[] = []
    for (const f of data.parentCollection) {
      post.push(f)
      if (f.id == data.id) {
        break
      }
    }
    this.post.set(post)
    this.postId.set(data.id)
  }

  ngOnInit(): void {
    if (this.post().length > 0) {
      this.hasPost = true
    }

    this.navigationStart = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {})

    if (this.loginService.loggedIn.value) {
      this.myId = this.loginService.getLoggedUserUUID()
    }

    this.subscription = this.route.params.subscribe(async (data: any) => {
      if (!data.id && !data.title) data = this.route.snapshot.data

      this.loading = true
      if (this.hasPost && !this.postId()) {
        this.postId.set(this.post()[0].id)
      }

      let title = data.title

      if (!title && data.id) {
        const UUIDRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gm
        const matches = data.id.match(UUIDRegex)
        if (!matches) {
          title = data.id
        }
      }

      if (title) {
        const tmpPost = await this.dashboardService.getArticle(title, data.blog)
        this.post.set(tmpPost ?? [])
        if (tmpPost) {
          this.postId.set(this.post()[0].id)
        }
      } else if (data.id && this.postId() != data.id) {
        this.postId.set(data.id)
        const tmpPost = await this.dashboardService.getPostV2(this.postId())
        this.post.set(tmpPost ?? [])
      }
      const tmpForumPosts = this.forumService.getForumThread(this.postId())
      this.forumPosts.set(await tmpForumPosts)
      this.loading = false

      // Set up meta tags now that we have the post
      const lastPost = this.post().at(-1)
      if (lastPost) {
        const atUri = this.atUriLinkElement()
        atUri.href = lastPost.bskyUri ?? ''

        const postIsArticle = lastPost.privacy === 20
        if (!postIsArticle) {
          this.simpleTitle.set(`Post by ${lastPost.user.nameMarkdown ?? lastPost.user.name} (${lastPost.user.url})`)
        }
      }
    })
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe()
    this.updateFollowsSubscription.unsubscribe()
  }

  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({
      behavior: 'instant',
      block: 'start',
      inline: 'nearest'
    })
  }

  async loadRepliesFromFediverse() {
    this.loading = true
    this.hasPost = true
    await this.postService.loadRepliesFromFediverse(this.post()[this.post().length - 1].id)
    this.forumPosts.set(await this.forumService.getForumThread(this.post()[this.post().length - 1].id))
    this.itemsPerPage = 25
    this.currentPage = 0
    this.loading = false
  }

  changePage(event: PageEvent) {
    this.scrollTo('scroll-here-on-page-change')
    this.itemsPerPage = event.pageSize
    this.currentPage = event.pageIndex
  }

  private atUriLinkElement(): HTMLLinkElement {
    const extElm = document.getElementById('atproto-alternate-uri')
    if (extElm) return <HTMLLinkElement>extElm

    const linkEl = document.createElement('link')
    linkEl.setAttribute('rel', 'alternate')
    linkEl.id = 'atproto-alternate-uri'
    document.head.appendChild(linkEl)
    return linkEl
  }
}
