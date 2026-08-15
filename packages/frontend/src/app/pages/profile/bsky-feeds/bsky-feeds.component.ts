import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faRss, faSearch, faThumbtack, faThumbtackSlash } from '@fortawesome/free-solid-svg-icons'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { BskyFeed, MyBskyFeed } from '../../../interfaces/bsky-feed'
import { BskyFeedsService } from '../../../services/bsky-feeds.service'
import { MessageService } from '../../../services/message.service'
import { SimpleTitleService } from '../../../services/simple-title.service'

@Component({
  selector: 'app-bsky-feeds',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatTooltipModule,
    RouterModule,
    FontAwesomeModule,
    LoaderComponent,
    TranslatePipe
  ],
  templateUrl: './bsky-feeds.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './bsky-feeds.component.scss'
})
export class BskyFeedsComponent {
  protected bskyFeedsService = inject(BskyFeedsService)
  private messageService = inject(MessageService)
  private translateService = inject(TranslateService)

  searchIcon = faSearch
  feedIcon = faRss
  pinIcon = faThumbtack
  unpinIcon = faThumbtackSlash

  displayedColumns = ['feed', 'creator', 'actions']

  loading = signal(true)
  searching = signal(false)
  searchTerm = ''

  myFeeds = signal<MyBskyFeed[]>([])
  searchResults = signal<BskyFeed[] | undefined>(undefined)

  rows = computed<BskyFeed[]>(() => this.searchResults() ?? this.myFeeds())
  followedUris = computed(() => new Set(this.myFeeds().map((feed) => feed.uri)))
  pinnedUris = computed(() => new Set(this.myFeeds().filter((feed) => feed.pinned).map((feed) => feed.uri)))

  constructor() {
    const simpleTitle = inject(SimpleTitleService)
    simpleTitle.set('menu.bskyFeeds')
    this.loadMyFeeds()
  }

  async loadMyFeeds() {
    this.loading.set(true)
    this.myFeeds.set(await this.bskyFeedsService.getMyFeeds())
    this.loading.set(false)
  }

  async search() {
    const term = this.searchTerm.trim()
    if (!term) return
    this.searching.set(true)
    this.searchResults.set(await this.bskyFeedsService.searchFeeds(term))
    this.searching.set(false)
  }

  isFollowed(uri: string): boolean {
    return this.followedUris().has(uri)
  }

  isPinned(uri: string): boolean {
    return this.pinnedUris().has(uri)
  }

  feedUrl(feed: BskyFeed): string {
    return '/dashboard/bskyFeed/' + encodeURIComponent(feed.uri)
  }

  async follow(feed: BskyFeed) {
    const success = await this.bskyFeedsService.followFeed(feed.uri)
    if (success) {
      this.messageService.add({
        severity: 'success',
        summary: this.translateService.instant('bskyFeeds.messages.followed', { name: feed.displayName })
      })
      await this.loadMyFeeds()
    }
  }

  async unfollow(feed: BskyFeed) {
    const success = await this.bskyFeedsService.unfollowFeed(feed.uri)
    if (success) {
      this.messageService.add({
        severity: 'success',
        summary: this.translateService.instant('bskyFeeds.messages.unfollowed', { name: feed.displayName })
      })
      await this.loadMyFeeds()
    }
  }

  async togglePin(feed: BskyFeed) {
    const success = this.isPinned(feed.uri)
      ? await this.bskyFeedsService.unpinFeed(feed.uri)
      : await this.bskyFeedsService.followFeed(feed.uri)
    if (success) {
      await this.loadMyFeeds()
    }
  }
}
