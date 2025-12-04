import { afterRenderEffect, Component, computed, ElementRef, input, output, signal, viewChild, viewChildren, inject } from '@angular/core'
import { ProcessedPost } from 'src/app/interfaces/processed-post'
import { PostModule } from '../post/post.module'
import { LoaderComponent } from '../loader/loader.component'
import { HotkeyAction, HotkeyService } from 'src/app/services/hotkey.service'
import { fromEvent, Subject, take, throttleTime } from 'rxjs'
import { PostComponent } from '../post/post.component'
import { MatGridListModule } from '@angular/material/grid-list'
import { DatePipe } from '@angular/common'
import { WafrnMediaModule } from '../wafrn-media/wafrn-media.module'
import { PostLinkModule } from 'src/app/directives/post-link/post-link.module'
import { TranslatePipe } from '@ngx-translate/core'
import { GlobalData } from 'src/app/services/global-data.service'
import { Tag } from 'src/app/interfaces/tag'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faPhotoFilm } from '@fortawesome/free-solid-svg-icons'

export type DisplayMode = 'card' | 'grid'

@Component({
  selector: 'app-post-list',
  imports: [
    PostModule,
    LoaderComponent,
    MatGridListModule,
    WafrnMediaModule,
    FontAwesomeModule,
    PostLinkModule,
    TranslatePipe,
    DatePipe
  ],
  templateUrl: './post-list.component.html',
  styleUrl: './post-list.component.scss'
})
export class PostListComponent {
  private globalData = inject(GlobalData);

  displayMode = input<DisplayMode>('card')
  posts = input.required<ProcessedPost[][]>()
  visible = input<boolean>(true) // Disables keybinds, required due to SnappyRouter so we do not act off screen
  loading = input.required<boolean>()
  loadPosts = output<void>()

  // Evil way of doing this because signals and jank
  visiblePreviousState: boolean = false
  loadingPreviousState: boolean = false
  loadedPageCount = 0

  bottomPageElementRef = viewChild<ElementRef<HTMLElement>>('bottom')
  bottomPageElement = computed(() => this.bottomPageElementRef()?.nativeElement)
  bottomPageObserver: IntersectionObserver | undefined
  postListRef = viewChildren<PostComponent, ElementRef<HTMLElement>>(PostComponent, { read: ElementRef })
  postListElements = computed(() => this.postListRef()?.map((post) => post.nativeElement))

  postIsActive = signal<boolean>(false)

  selectedPost: number = 0
  postActionSubject = new Subject<HotkeyAction>()

  colCount: number

  videoIcon = faPhotoFilm

  constructor() {
    const hotkeyService = inject(HotkeyService);

    hotkeyService.hotkeySubscription.subscribe((type) => this.handleHotkeys(type))

    this.colCount = this.calculateMediaColumns()
    fromEvent(window, 'resize')
      .pipe(throttleTime(50))
      .subscribe(() => {
        this.colCount = this.calculateMediaColumns()
      })

    // Reload if loading finished but the observer is still visible
    afterRenderEffect(() => {
      const becameVisible = !this.visible() && this.visiblePreviousState
      this.visiblePreviousState = this.visible()
      if (!this.visible() || becameVisible) return

      const finishedLoading = !this.loading() && this.loadingPreviousState
      this.loadingPreviousState = this.loading()
      if (!finishedLoading) return

      this.loadedPageCount += 1
      if (this.loadedPageCount === 1) return

      const rect = this.bottomPageElement()?.getBoundingClientRect()
      if (!rect) return
      const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight)
      if (rect.bottom < 0 || rect.top - viewHeight >= 0) return

      this.loadPosts.emit()
    })
  }

  ngOnInit() {
    this.visiblePreviousState = this.visible()
    this.loadingPreviousState = this.loading()

    this.bottomPageObserver = new IntersectionObserver((entries) => {
      if (!this.visible()) return
      const entry = entries[0]

      // Do not send the signal if we're already loading or just loaded
      if (this.loading() || !entry.isIntersecting) return

      this.loadPosts.emit()
    })
    this.bottomPageObserver.observe(this.bottomPageElement()!)
  }

  postElementAt(index: number): HTMLElement | null {
    return document.getElementById('post-element-' + this.posts().at(index)?.at(-1)?.id)
  }

  selectMiddlePost() {
    // Find the post whose top is closest to the top of the screen
    const windowCenter = window.scrollY
    const postDistances = this.postListElements().map((elem) => Math.abs(elem.offsetTop - windowCenter))
    const smallestDistance = Math.min(...postDistances)
    const closestPostIndex = postDistances.findIndex((elem) => elem === smallestDistance)

    this.selectedPost = closestPostIndex
    this.scrollToSelectedPost(true) // Smooth scroll to initial highlighted post (UX!!)

    // Stop highlighting if the user manually scrolls with the mouse
    fromEvent(document, 'wheel')
      .pipe(take(1))
      .subscribe(() => {
        this.postIsActive.set(false)
      })
  }

  handleHotkeys(action: HotkeyAction) {
    if (!this.visible()) return

    switch (action) {
      // Stop highlighting if screen-based scroll is used
      case 'scrollDown':
      case 'scrollUp':
      case 'scrollUpPage':
      case 'scrollDownPage':
        this.postIsActive.set(false)
        break
      case 'nextPost':
        this.nextPost()
        break
      case 'previousPost':
        this.previousPost()
        break
      default:
        // Send other actions to bottom reply bar
        this.postActionSubject.next(action)
        break
    }
  }

  //
  // Hotkey functions
  //

  previousPost() {
    if (!this.postIsActive()) {
      this.selectMiddlePost()
      return
    }

    if (this.selectedPost > 0) {
      this.selectedPost -= 1
    }
    this.scrollToSelectedPost()
  }

  nextPost() {
    if (!this.postIsActive()) {
      this.selectMiddlePost()
      return
    }

    if (this.selectedPost < this.posts().length - 1) {
      this.selectedPost += 1
    }
    // Next post on the last post triggers loading new posts and scrolls to the loader
    if (this.selectedPost === this.posts().length - 1) {
      this.loadPosts.emit()
      this.scrollToLoader()
      return
    }
    this.scrollToSelectedPost()
  }

  scrollToLoader(smooth: boolean = false) {
    this.bottomPageElement()?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
    this.afterPostScroll()
  }

  scrollToSelectedPost(smooth: boolean = false) {
    const nextPost = this.postElementAt(this.selectedPost ?? 0)
    if (nextPost === null) return
    nextPost?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
    this.afterPostScroll()
  }

  afterPostScroll() {
    this.postIsActive.set(true)
  }

  calculateMediaColumns() {
    if (this.globalData.mobile()) {
      return Math.max(2, Math.floor(window.innerWidth / 200))
    }
    return 4
  }

  mapTags(tagList: Tag[]): string {
    return tagList.map((tag) => `#${tag.tagName}`).join(' ')
  }
}
