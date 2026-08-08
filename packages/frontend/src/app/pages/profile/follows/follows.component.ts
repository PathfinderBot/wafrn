import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import { Component, OnDestroy, OnInit, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatInputModule } from '@angular/material/input'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router'
import { filter, Subscription } from 'rxjs'
import { AvatarSmallComponent } from '../../../components/avatar-small/avatar-small.component'
import { faCheck, faTrash } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { TranslatePipe } from '@ngx-translate/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { BlogHeaderComponent } from '../../../components/blog-header/blog-header.component'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { BlogLinkDirective } from '../../../directives/blog-link/blog-link.directive'
import { followsResponse } from '../../../interfaces/follows-response'
import { SimplifiedUser } from '../../../interfaces/simplified-user'
import { BlogService } from '../../../services/blog.service'
import { DashboardService } from '../../../services/dashboard.service'
import { LoginService } from '../../../services/login.service'
import { PostsService } from '../../../services/posts.service'

@Component({
  selector: 'app-follows',
  imports: [
    CommonModule,
    LoaderComponent,
    BlogHeaderComponent,
    MatTableModule,
    MatPaginatorModule,
    ScrollingModule,
    FormsModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    RouterModule,
    AvatarSmallComponent,
    FontAwesomeModule,
    MatTooltipModule,
    BlogLinkDirective,
    TranslatePipe
  ],
  templateUrl: './follows.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './follows.component.scss'
})
export class FollowsComponent implements OnInit, OnDestroy {
  activatedRoute = inject(ActivatedRoute)
  private router = inject(Router)
  postService = inject(PostsService)
  private dashboardService = inject(DashboardService)
  private blogService = inject(BlogService)

  navigationSubscription: Subscription
  followsSubscription: Subscription
  loading = true
  blogDetails: any
  followedUsers: string[] = []
  notYetAcceptedFollows: string[] = []
  blogUrl: string = ''
  found = true
  following = false
  displayedColumns = ['avatar', 'url', 'date', 'actions', 'removeFollower']
  myId: string
  deleteIcon = faTrash
  acceptIcon = faCheck

  @ViewChild(MatPaginator) paginator!: MatPaginator

  dataSource!: MatTableDataSource<followsResponse, MatPaginator>

  constructor() {
    const loginService = inject(LoginService)

    this.myId = loginService.getLoggedUserUUID()
    this.followsSubscription = this.postService.updateFollowers.subscribe(() => {
      this.followedUsers = this.postService.followedUserIds
      this.notYetAcceptedFollows = this.postService.notYetAcceptedFollowedUsersIds
    })
    this.navigationSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.loading = true
        this.ngOnInit()
      })
  }

  async ngOnInit(): Promise<void> {
    this.dataSource = new MatTableDataSource<followsResponse, MatPaginator>([])
    this.blogUrl = this.activatedRoute.snapshot.paramMap.get('url') as string
    this.following = !!this.activatedRoute.snapshot.routeConfig?.path?.toLowerCase()?.endsWith('following')
    const blogPromise = this.dashboardService.getBlogDetails(this.blogUrl).catch(() => {
      this.found = false
      this.loading = false
    })
    let followsPromise = this.blogService.getFollowers(this.blogUrl, this.following)
    await Promise.all([blogPromise, followsPromise])
    const blogResponse = await blogPromise
    const followsResponse = await followsPromise
    if (blogResponse) {
      this.blogDetails = blogResponse
      this.dataSource.data = followsResponse
      this.loading = false
      setTimeout(() => {
        this.dataSource.paginator = this.paginator
      })
    }
  }

  ngOnDestroy(): void {
    this.navigationSubscription.unsubscribe()
    this.followsSubscription.unsubscribe()
  }

  async deleteFollower(user: SimplifiedUser) {
    await this.blogService.deleteFollow(user.id)
    this.ngOnInit()
  }

  async acceptFollower(user: SimplifiedUser) {
    await this.blogService.approveFollow(user.id)
    this.ngOnInit()
  }
}
