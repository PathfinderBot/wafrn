import { Component, computed, ElementRef, EventEmitter, input, OnDestroy, OnInit, Output, signal, viewChild, viewChildren, inject, OnChanges } from '@angular/core'
import { ProcessedPost } from 'src/app/interfaces/processed-post'
import { LoginService } from 'src/app/services/login.service'
import { PostsService } from 'src/app/services/posts.service'

import {
  faArrowUpRightFromSquare,
  faCheck,
  faChevronDown,
  faClose,
  faEnvelope,
  faGlobe,
  faHeart,
  faHeartBroken,
  faPen,
  faQuoteLeft,
  faRepeat,
  faReply,
  faRobot,
  faServer,
  faShareNodes,
  faTrash,
  faUnlock,
  faUser
} from '@fortawesome/free-solid-svg-icons'
import { SimplifiedUser } from 'src/app/interfaces/simplified-user'
import { EnvironmentService } from 'src/app/services/environment.service'
import { Subject, Subscription } from 'rxjs'
import { BottomReplyBarComponent } from '../bottom-reply-bar/bottom-reply-bar.component'
import { HotkeyAction } from 'src/app/services/hotkey.service'
import { PostFragmentComponent } from '../post-fragment/post-fragment.component'

@Component({
  selector: 'app-post',
  templateUrl: './post.component.html',
  styleUrls: ['./post.component.scss'],
  standalone: false
})
export class PostComponent implements OnChanges, OnDestroy {
  postService = inject(PostsService);
  private readonly loginService = inject(LoginService);

  post = input.required<ProcessedPost[]>()
  postSliced: ProcessedPost[] = []

  active = input<boolean>(false)
  showFull: boolean = false
  postCanExpand = computed(() => {
    const textLength = this.post()
      .map((elem) => elem.content)
      .join('').length

    const textIsLong = textLength > 2500
    const threadHasMorePosts = this.postSliced.length !== this.post().length

    return (((textIsLong || !this.showFull) && !this.expanded()) || threadHasMorePosts) && !this.startExpanded()
  })
  startExpanded = input<boolean>(false)
  scrollToPost = input<boolean>(false)

  postsExpanded = EnvironmentService.environment.shortenPosts
  expanded = signal(false)
  finalPosts = computed(() => this.post().slice(-2))
  mediaBaseUrl = EnvironmentService.environment.baseMediaUrl
  followedUsers: string[] = []
  notYetAcceptedFollows: string[] = []
  notes = computed(() => this.uniquePost().notes.toString())
  headerText = computed(() => (this.isEmptyReblog() ? 'rewooted' : 'replied'))
  quickReblogBeingDone = false
  quickReblogDoneSuccessfully = false
  reblogging = false
  myId: string = ''
  loadingAction = false
  // 0 no display at all 1 display like 2 display dislike
  showLikeFinalPost = computed(() =>
    this.finalPost().userId === this.myId ? (this.finalPost().userLikesPostRelations.includes(this.myId) ? 2 : 1) : 0
  )
  // Last post including empty reblog
  uniquePost = computed(() => this.post()[this.post().length - 1])
  // Last non-empty reblog post
  finalPost = computed(() =>
    this.isEmptyReblog() && this.post().length > 1
      ? this.post()[this.post().length - 2]
      : this.post()[this.post().length - 1]
  )

  postElemRefs = viewChildren<PostFragmentComponent, ElementRef<HTMLElement>>(PostFragmentComponent, {
    read: ElementRef<HTMLElement>
  })

  // icons
  shareIcon = faShareNodes
  expandDownIcon = faChevronDown
  solidHeartIcon = faHeart
  clearHeartIcon = faHeartBroken
  replyIcon = faReply
  reblogIcon = faRepeat
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
  botIcon = faRobot

  // bottom bar for controls
  bottomReplyBar = viewChild.required(BottomReplyBarComponent)

  // subscriptions
  updateFollowersSubscription
  updateLikesSubscription: Subscription | undefined
  actionSubscription = input<Subject<HotkeyAction>>()

  // post seen
  @Output() seenEmitter: EventEmitter<boolean> = new EventEmitter<boolean>()

  // dismiss cw
  showCw = true

  // VARIABLES FOR TEMPLATE RENDERING
  ribbonUser: SimplifiedUser | undefined
  ribbonIcon = this.replyIcon
  ribbonTime = new Date(0)

  // detect is safari ios because flicker bug on webkit https://stackoverflow.com/questions/3007480/determine-if-user-navigated-from-mobile-safaris
  ua = window.navigator.userAgent
  iOS = !!this.ua.match(/iPad/i) || !!this.ua.match(/iPhone/i)
  webkit = !!this.ua.match(/WebKit/i)
  iOSSafari = this.iOS && this.webkit && !this.ua.match(/CriOS/i)

  constructor() {
    const loginService = this.loginService;

    if (this.loginService.loggedIn.value) {
      this.myId = loginService.getLoggedUserUUID()
    }
    this.updateFollowersSubscription = this.postService.updateFollowers.subscribe(() => {
      this.followedUsers = this.postService.followedUserIds
      this.notYetAcceptedFollows = this.postService.notYetAcceptedFollowedUsersIds
    })
  }

  ngOnDestroy(): void {
    this.updateFollowersSubscription.unsubscribe()
    this.updateLikesSubscription?.unsubscribe()
  }

  ngOnChanges(): void {
    this.followedUsers = this.postService.followedUserIds
    this.notYetAcceptedFollows = this.postService.notYetAcceptedFollowedUsersIds

    // Do not auto-expand ultra-hell threads
    const threadIsExtremelyLong = this.post().length - this.postsExpanded > 50
    if (this.startExpanded() && !threadIsExtremelyLong) {
      this.postSliced = this.post()
    } else {
      this.postSliced = this.post().slice(0, EnvironmentService.environment.shortenPosts)
    }

    if (this.post().length === this.postSliced.length) {
      this.showFull = true
    }

    this.ribbonUser = this.uniquePost().user
    this.ribbonIcon = this.headerText() === 'replied' ? this.replyIcon : this.reblogIcon
    this.ribbonTime = this.uniquePost().createdAt
    // If user has marked autoexpand we force 1 expand. Doing full could cause EXPLOSIONS
    if (localStorage.getItem('automaticalyExpandPosts') === 'true') {
      this.expandPost()
    }

    this.updateLikesSubscription = this.postService.postLiked.subscribe((likeEvent) => {
      if (this.post() && likeEvent.id === this.uniquePost().id) {
        if (likeEvent.like) {
          this.uniquePost().userLikesPostRelations = [this.loginService.getLoggedUserUUID()]
        } else {
          this.uniquePost().userLikesPostRelations = []
        }
      }
    })

    this.actionSubscription()?.subscribe((action) => this.handlePostActions(action))
  }

  ngAfterViewInit() {
    if (this.startExpanded()) {
      const lastPost = this.postElemRefs().at(-1)

      // Scroll as component is loaded and queue up another scroll once the page is fully loaded (evil)
      // Causes mild screen flash
      lastPost?.nativeElement.scrollIntoView({ behavior: 'instant', block: 'center' })
      setTimeout(() => {
        lastPost?.nativeElement.scrollIntoView({ behavior: 'instant', block: 'center' })
      })
    }
  }

  isEmptyReblog() {
    const finalOne = this.uniquePost()
    return !finalOne
      ? true
      : this.post() &&
      finalOne.content == '' &&
      finalOne.tags.length == 0 &&
      finalOne.quotes.length == 0 &&
      !finalOne.questionPoll &&
      finalOne.medias?.length == 0
  }

  // Adds 50 more posts to the sliced list
  expandPost() {
    this.expanded.set(true)
    this.postsExpanded += 50
    this.postSliced = this.post().slice(0, this.postsExpanded)
  }

  async handlePostActions(action: HotkeyAction) {
    if (!this.active()) return

    switch (action) {
      case 'likePost':
        await this.bottomReplyBar().postActionButtons()?.toggleLike()
        break
      case 'rewootPost':
        await this.bottomReplyBar().postActionButtons()?.toggleReblog()
        break
      case 'replyPost':
        await this.bottomReplyBar().postActionButtons()?.replyPost()
        break
      case 'quotePost':
        await this.bottomReplyBar().postActionButtons()?.quotePost()
        break
      case 'bookmarkPost':
        await this.bottomReplyBar().postActionButtons()?.toggleBookmark()
        break
      default:
        break
    }
  }
}
