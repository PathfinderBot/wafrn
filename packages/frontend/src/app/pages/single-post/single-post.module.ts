import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterModule, Routes } from '@angular/router'
import { PostComponent } from '../../components/post/post.component'
import { PagenotfoundComponent } from '../pagenotfound/pagenotfound.component'
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
    PostComponent,
    PagenotfoundComponent,
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
