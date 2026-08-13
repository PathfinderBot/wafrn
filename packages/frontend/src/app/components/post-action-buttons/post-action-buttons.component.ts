import {
  Component,
  computed,
  ElementRef,
  input,
  OnChanges,
  signal,
  viewChild,
  inject,
  ChangeDetectorRef,
  ChangeDetectionStrategy
} from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatMenuModule } from '@angular/material/menu'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import {
  faShareNodes,
  faChevronDown,
  faHeart,
  faHeartBroken,
  faReply,
  faRepeat,
  faQuoteLeft,
  faArrowUpRightFromSquare,
  faTrash,
  faClose,
  faGlobe,
  faUnlock,
  faEnvelope,
  faServer,
  faUser,
  faPen,
  faCheck,
  faBookmark,
  faBookBookmark
} from '@fortawesome/free-solid-svg-icons'
import { TranslatePipe } from '@ngx-translate/core'
import { delay, firstValueFrom, of, Subject, switchMap, takeUntil } from 'rxjs'
import { PostLinkDirective } from '../../directives/post-link/post-link.directive'
import { ProcessedPost } from '../../interfaces/processed-post'
import { DashboardService } from '../../services/dashboard.service'
import { DeletePostService } from '../../services/delete-post.service'
import { EditorService } from '../../services/editor.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'
import { ParticleService } from '../../services/particle.service'
import { PostsService } from '../../services/posts.service'
import { SettingsService, SettingKey, SettingListItem } from '../../services/settings.service'

export const replyBarItems = ['quote', 'rewoot', 'reply', 'bookmark', 'like', 'edit', 'delete'] as const
export type replyBarItemsVariants = typeof replyBarItems
export type ReplyBarItem = replyBarItemsVariants[number]

@Component({
  selector: 'app-post-action-buttons',
  imports: [
    RouterModule,
    FontAwesomeModule,
    MatButtonModule,
    MatTooltipModule,
    PostLinkDirective,
    MatMenuModule,
    TranslatePipe
  ],
  templateUrl: './post-action-buttons.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './post-action-buttons.component.scss'
})
export class PostActionButtonsComponent implements OnChanges {
  readonly loginService = inject(LoginService)
  private readonly postService = inject(PostsService)
  private readonly editorService = inject(EditorService)
  private readonly deletePostService = inject(DeletePostService)
  private readonly messages = inject(MessageService)
  private readonly editor = inject(EditorService)
  private settingsService = inject(SettingsService)
  private particle = inject(ParticleService)
  private cdr = inject(ChangeDetectorRef)

  fragment = input.required<ProcessedPost>()
  settingKey = input.required<SettingKey>()

  isEmptyReblog = false
  myId = ''
  loadingRewoot = false
  loadingLike = false
  loadingBookmark = false
  myRewootsIncludePost = computed(() => this.postService.rewootedPosts().has(this.fragment().id))
  bookmarked = signal<boolean>(false)

  // icons
  shareIcon = faShareNodes
  expandDownIcon = faChevronDown
  solidHeartIcon = faHeart
  clearHeartIcon = faHeartBroken
  reblogIcon = faReply
  quickReblogIcon = faRepeat
  quoteIcon = faQuoteLeft
  shareExternalIcon = faArrowUpRightFromSquare
  deleteIcon = faTrash
  closeIcon = faClose
  worldIcon = faGlobe
  unlockIcon = faUnlock
  envelopeIcon = faEnvelope
  serverIcon = faServer
  userIcon = faUser
  editedIcon = faPen
  checkIcon = faCheck
  bookmarkIcon = faBookmark
  unbookmarkIcon = faBookBookmark

  // Ordering
  buttonList: SettingListItem[] = []

  // Special logic to handle holding on reblog to open a menu
  reblogMenuOpener = viewChild<ElementRef<HTMLButtonElement>>('reblogMenuOpener')
  readonly reblogHoldLength = 500 // Open menu instead of doing a reblog in 0.5 seconds
  reblockClickTime = 0
  reblogMenuSubject = new Subject<void>()
  stopReblogMenuSubject = new Subject<void>()
  accountList
  toAvatarUrl // mirrored function

  constructor() {
    const loginService = this.loginService
    const dashboardService = inject(DashboardService)

    this.accountList = loginService.accountList
    this.toAvatarUrl = dashboardService.getAvatarUrl

    if (loginService.loggedIn.value) {
      this.myId = loginService.getLoggedUserUUID()
    }

    this.reblogMenuSubject
      .pipe(switchMap((val) => of(val).pipe(delay(this.reblogHoldLength), takeUntil(this.stopReblogMenuSubject))))
      .subscribe(() => {
        this.reblogMenuOpener()?.nativeElement?.click()
      })
  }

  ngOnInit(): void {
    this.buttonList = this.settingsService.values()[this.settingKey()] as SettingListItem[]
    this.bookmarked.set(this.fragment().bookmarkers.includes(this.myId))
  }

  ngOnChanges(): void {
    const finalOne = this.fragment()
    this.isEmptyReblog =
      finalOne &&
      finalOne.content == '' &&
      finalOne.tags.length == 0 &&
      finalOne.quotes.length == 0 &&
      !finalOne.questionPoll &&
      finalOne.medias?.length == 0
  }

  async replyPost() {
    await this.editorService.replyPost(this.fragment())
  }

  async quotePost() {
    await this.editorService.quotePost(this.fragment())
  }

  async editPost(post: ProcessedPost) {
    await this.editorService.replyPost(post, true)
  }

  async deletePost(id: string) {
    this.deletePostService.openDeletePostDialog(id)
  }

  async deleteRewoots() {
    this.loadingRewoot = true
    const success = await firstValueFrom(this.deletePostService.deleteRewoots(this.fragment().id))
    if (success) {
      this.postService.rewootedPosts.update((set) => {
        set.delete(this.fragment().id)
        return set
      })
      this.messages.add({
        severity: 'success',
        summary: 'messages.deleteRewootSuccess',
        translate: true
      })
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
    this.loadingRewoot = false
    this.cdr.detectChanges()
  }

  async toggleLike() {
    if (this.loadingLike || this.fragment().userId === this.myId) return

    const hasLikedPost = this.fragment().userLikesPostRelations.includes(this.myId)
    if (!hasLikedPost) {
      this.likePost()
    } else {
      this.unlikePost()
    }
  }

  async likePost(event?: MouseEvent) {
    const scrollPos = { x: window.scrollX, y: window.scrollY }
    this.loadingLike = true
    if (await this.postService.likePost(this.fragment().id)) {
      this.fragment().userLikesPostRelations.push(this.myId)
      this.messages.add({
        severity: 'success',
        summary: 'messages.likePostSuccess',
        translate: true,
        soundName: 'like'
      })
      this.particle.like(event, scrollPos)
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
    this.loadingLike = false
    this.cdr.detectChanges()
  }

  async unlikePost() {
    this.loadingLike = true
    if (await this.postService.unlikePost(this.fragment().id)) {
      this.fragment().userLikesPostRelations = this.fragment().userLikesPostRelations.filter(
        (elem) => elem != this.myId
      )
      this.messages.add({
        severity: 'success',
        summary: 'messages.unlikePostSuccess',
        translate: true
      })
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
    this.loadingLike = false
    this.cdr.detectChanges()
  }

  async toggleBookmark() {
    if (!this.bookmarked()) {
      this.bookmarkPost()
    } else {
      this.unbookmarkPost()
    }
  }

  async bookmarkPost(event?: MouseEvent) {
    const scrollPos = { x: window.scrollX, y: window.scrollY }
    this.loadingBookmark = true
    if (await this.postService.bookmarkPost(this.fragment().id)) {
      this.fragment().bookmarkers.push(this.myId)
      this.messages.add({
        severity: 'success',
        summary: 'messages.bookmarkPostSuccess',
        translate: true
      })
      this.particle.emojiReact('💾', event, scrollPos)
      this.bookmarked.set(true)
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
    this.loadingBookmark = false
    this.cdr.detectChanges()
  }

  async unbookmarkPost() {
    this.loadingBookmark = true
    if (await this.postService.unbookmarkPost(this.fragment().id)) {
      this.fragment().bookmarkers = this.fragment().bookmarkers.filter((elem) => elem != this.myId)
      this.messages.add({
        severity: 'success',
        summary: 'messages.unbookmarkPostSuccess',
        translate: true
      })
      this.bookmarked.set(false)
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
    this.loadingBookmark = false
    this.cdr.detectChanges()
  }

  async toggleReblog() {
    if (!this.myRewootsIncludePost) {
      this.quickReblog()
    } else {
      this.deleteRewoots()
    }
  }

  startReblog(event: MouseEvent) {
    event.stopPropagation()
    this.reblockClickTime = Date.now()
    this.reblogMenuSubject.next()
  }
  endReblog(event: MouseEvent) {
    const holdDuration = Date.now() - this.reblockClickTime
    if (holdDuration > this.reblogHoldLength) return
    this.stopReblogMenuSubject.next()

    this.quickReblog(undefined, event)
  }

  async quickReblog(accountIndex?: number, event?: MouseEvent) {
    const scrollPos = { x: window.scrollX, y: window.scrollY }
    this.loadingRewoot = true
    if (this.fragment().privacy !== 10) {
      const response = await this.editor.createPost({
        mentionedUsers: [],
        content: '',
        idPostToReblog: this.fragment().id,
        privacy: this.loginService.getUserDefaultRewootPrivacyLevel(),
        media: [],
        withToken: accountIndex ? this.accountList().at(accountIndex)?.token : undefined
      })
      if (response) {
        // HACK: Only set as rewooted if we reblog as the current user
        // We can't easily check if other logged in accounts so we just allow you to do as many on other accounts
        // Does not work well on sites like Mastodon but it's probably fine...
        if (this.accountList === undefined || (accountIndex ?? 0) === 0) {
          this.postService.rewootedPosts.update((set) => set.add(this.fragment().id))
        }
        this.messages.add({
          severity: 'success',
          summary: 'messages.rewootPostSuccess',
          translate: true,
          soundName: 'sendWoot'
        })
        this.particle.emojiReact('🔁', event, scrollPos)
      }
    } else {
      this.messages.add({
        severity: 'warn',
        summary: 'messages.notRewootableError',
        translate: true
      })
    }
    this.loadingRewoot = false
    this.cdr.detectChanges()
  }
}
