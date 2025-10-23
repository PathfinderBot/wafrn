import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { DashboardComponent } from './dashboard.component'
import { RouterModule, Routes } from '@angular/router'
import { PostModule } from 'src/app/components/post/post.module'
import { loginRequiredGuard } from 'src/app/guards/login-required.guard'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { MatButtonModule } from '@angular/material/button'
import { ReuseableRouteType } from 'src/app/services/routing.service'
import { ForumComponent } from '../forum/forum.component'
import { MatCardModule } from '@angular/material/card'
import { PostListComponent } from 'src/app/components/post-list/post-list.component'
import { TranslateModule } from '@ngx-translate/core'

const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    canActivate: [loginRequiredGuard],
    data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
  },
  {
    path: 'explore',
    component: DashboardComponent,
    canActivate: [loginRequiredGuard],
    data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
  },
  {
    path: 'exploreLocal',
    component: DashboardComponent,
    data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
  },
  {
    path: 'private',
    component: DashboardComponent,
    canActivate: [loginRequiredGuard]
  }
]

@NgModule({
  declarations: [DashboardComponent],
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    PostModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    FontAwesomeModule,
    ForumComponent,
    MatCardModule,
    PostListComponent,
    TranslateModule
  ]
})
export class DashboardModule {}
