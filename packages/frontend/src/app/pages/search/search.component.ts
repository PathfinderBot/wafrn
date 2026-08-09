import { Component, OnDestroy, OnInit, Signal, signal, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule, ReactiveFormsModule, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms'
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTabsModule } from '@angular/material/tabs'
import { MatExpansionModule } from '@angular/material/expansion'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { TranslateModule } from '@ngx-translate/core'
import { PostComponent } from '../../components/post/post.component'
import { UserSelectorComponent } from '../../components/user-selector/user-selector.component'
import { BlogLinkDirective } from '../../directives/blog-link/blog-link.directive'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import { Subscription, filter } from 'rxjs'
import { ProcessedPost } from '../../interfaces/processed-post'
import { SimplifiedUser } from '../../interfaces/simplified-user'
import { DashboardService } from '../../services/dashboard.service'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'
import { UserOptionsService } from '../../services/user-options.service'
import { SimpleTitleService } from '../../services/simple-title.service'

@Component({
  selector: 'app-search',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    PostComponent,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FontAwesomeModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    BlogLinkDirective,
    MatExpansionModule,
    UserSelectorComponent,
    TranslateModule
  ],
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class SearchComponent implements OnInit, OnDestroy {
  private dashboardService = inject(DashboardService)
  private messages = inject(MessageService)
  userOptionsService = inject(UserOptionsService)
  protected loginService = inject(LoginService)
  private activatedRoute = inject(ActivatedRoute)

  searchForm: UntypedFormGroup = new UntypedFormGroup({
    search: new UntypedFormControl('', [Validators.required]),
    user: new UntypedFormControl('')
  })
  currentSearch = ''
  posts = signal<ProcessedPost[][]>([])
  viewedPosts = 0
  users = signal<SimplifiedUser[]>([])
  avatars: Record<string, string> = {}
  viewedUsers = 0
  followedUsers: string[] = []
  notYetAcceptedFollows: string[] = []

  currentPage = 0
  loading = signal(false)
  navigationSubscription: Subscription
  updateFollowersSubscription: Subscription
  searchIcon = faSearch
  atLeastOneSearchDone = false

  currentlyFollowedHashtags: string[] = []

  constructor() {
    const router = inject(Router)
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.search')

    this.navigationSubscription = router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.ngOnInit()
      })
    this.updateFollowersSubscription = this.userOptionsService.updateFollowers.subscribe(() => {
      this.followedUsers = this.userOptionsService.followedUserIds
      this.notYetAcceptedFollows = this.userOptionsService.notYetAcceptedFollowedUsersIds
    })
  }
  ngOnDestroy(): void {
    this.navigationSubscription.unsubscribe()
    this.updateFollowersSubscription.unsubscribe()
  }

  ngOnInit(): void {
    this.followedUsers = this.userOptionsService.followedUserIds
    this.notYetAcceptedFollows = this.userOptionsService.notYetAcceptedFollowedUsersIds
    if (this.activatedRoute.snapshot.queryParamMap.get('uri')) {
      this.searchForm.patchValue({
        search: this.activatedRoute.snapshot.queryParamMap.get('uri')
      })
      this.submitSearch()
    }
    if (this.activatedRoute.snapshot.paramMap.get('term')) {
      this.searchForm.patchValue({
        search: this.activatedRoute.snapshot.paramMap.get('term')
      })
      this.submitSearch()
    }
  }

  getAvatar(url: string) {
    return this.avatars[url]
  }

  async submitSearch() {
    this.loading.set(true)
    this.atLeastOneSearchDone = true
    this.viewedPosts = 0
    this.viewedUsers = 0
    this.currentPage = 0
    this.posts.set([])
    this.users.set([])
    this.currentSearch = this.searchForm.value['search']
    const searchResult = await this.dashboardService.getSearchPage(this.currentPage, this.currentSearch, {
      user: this.searchForm.controls['user'].value
    })
    this.posts.set(searchResult.posts)
    this.users.set(searchResult.users)
    searchResult.users.forEach((user) => {
      this.avatars[user.url] = this.getAvatarUrl(user)
    })
    this.loading.set(false)

    setTimeout(() => {
      // we detect the bottom of the page and load more posts
      const element = document.querySelector('#if-you-see-this-load-more-posts')
      const observer = new IntersectionObserver((intersectionEntries: IntersectionObserverEntry[]) => {
        if (intersectionEntries[0].isIntersecting) {
          this.currentPage++
          this.loadResults(this.currentPage)
        }
      })
      if (element) {
        observer.observe(element)
      }
    }, 250)
  }

  async loadResults(page: number) {
    const searchResult = await this.dashboardService.getSearchPage(page, this.currentSearch, {
      user: this.searchForm.controls['user'].value
    })
    searchResult.posts.forEach((post) => this.posts().push(post))
    searchResult.users.forEach((user) => {
      this.users().push(user)
      this.avatars[user.url] = this.getAvatarUrl(user)
    })
  }

  private getAvatarUrl(user: SimplifiedUser): string {
    return (
      (EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : '') +
      '/api/v2/cache/avatar/' +
      user.id
    )
  }

  async followUser(id: string) {
    const response = await this.userOptionsService.followUser(id)
    if (response) {
      this.messages.add({
        severity: 'success',
        summary: 'You now follow this user!'
      })
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'Something went wrong! Check your internet conectivity and try again'
      })
    }
  }

  async unfollowUser(id: string) {
    const response = await this.userOptionsService.unfollowUser(id)
    if (response) {
      this.messages.add({
        severity: 'success',
        summary: 'You no longer follow this user!'
      })
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'Something went wrong! Check your internet conectivity and try again'
      })
    }
  }

  async followUnfollowHashtag(tag: string) {
    this.loading.set(true)
    let success = await this.dashboardService.manageHashtagSubscription(
      tag,
      !this.userOptionsService.followedHashtags.includes(tag.toLowerCase())
    )
    if (success) {
      this.messages.add({
        severity: 'success',
        summary:
          (this.userOptionsService.followedHashtags.includes(tag.toLowerCase())
            ? 'You no longer follow the tag #'
            : 'You now follow the tag #') + tag
      })
    }
    await this.userOptionsService.loadFollowers()
    this.loading.set(false)
  }

  searchUserSelected(evt: { remoteId: string; url: string }) {
    this.searchForm.controls['user'].patchValue(evt.url)
  }
}
