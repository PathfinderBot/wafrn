import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterModule, Routes } from '@angular/router'
import { PostModule } from '../../components/post/post.module'
import { PagenotfoundModule } from '../pagenotfound/pagenotfound.module'
import { MatTableModule } from '@angular/material/table'
import { MatPaginatorModule } from '@angular/material/paginator'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { ForumComponent } from '../forum/forum.component'
import { AvatarSmallComponent } from '../../components/avatar-small/avatar-small.component'
import { LoaderComponent } from '../../components/loader/loader.component'

const routes: Routes = [
  {
    path: ':id',
    component: ForumComponent
  },
  {
    path: ':blog/:title',
    component: ForumComponent
  }
]

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    PostModule,
    PagenotfoundModule,
    MatTableModule,
    MatPaginatorModule,
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    LoaderComponent,
    FontAwesomeModule,
    AvatarSmallComponent
  ]
})
export class SinglePostModule {}
