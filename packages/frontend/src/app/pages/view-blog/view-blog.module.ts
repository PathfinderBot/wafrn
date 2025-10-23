import { NgModule } from '@angular/core'
import { CommonModule, DatePipe } from '@angular/common'
import { RouterModule, Routes } from '@angular/router'
import { ViewBlogComponent } from './view-blog.component'
import { PostModule } from '../../components/post/post.module'
import { PagenotfoundModule } from '../pagenotfound/pagenotfound.module'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { MatMenuModule } from '@angular/material/menu'
import { LoaderComponent } from 'src/app/components/loader/loader.component'
import { BlogHeaderComponent } from '../../components/blog-header/blog-header.component'
import { InfoCardComponent } from 'src/app/components/info-card/info-card.component'
import { ForumComponent } from '../forum/forum.component'
import { PostListComponent } from 'src/app/components/post-list/post-list.component'
import { MatTabsModule } from '@angular/material/tabs'
import { TranslatePipe } from '@ngx-translate/core'

const routes: Routes = [
  {
    path: ':url',
    component: ViewBlogComponent,
    data: { reuseRoute: true }
  },
  {
    path: ':url/ask',
    component: ViewBlogComponent
  },
  {
    path: ':url/followers',
    loadComponent: () => import('../../pages/profile/follows/follows.component').then((m) => m.FollowsComponent)
  },
  {
    path: ':url/following',
    loadComponent: () => import('../../pages/profile/follows/follows.component').then((m) => m.FollowsComponent)
  }
]

@NgModule({
  declarations: [ViewBlogComponent],
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    PostModule,
    PagenotfoundModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatButtonModule,
    FontAwesomeModule,
    MatMenuModule,
    LoaderComponent,
    BlogHeaderComponent,
    InfoCardComponent,
    ForumComponent,
    PostListComponent,
    MatTabsModule,
    TranslatePipe
  ]
})
export class ViewBlogModule {}
