import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { SearchComponent } from './search.component'
import { RouterModule, Routes } from '@angular/router'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTabsModule } from '@angular/material/tabs'
import { MatExpansionModule } from '@angular/material/expansion'
import { TranslateModule } from '@ngx-translate/core'
import { PostModule } from '../../components/post/post.module'
import { UserSelectorComponent } from '../../components/user-selector/user-selector.component'
import { BlogLinkModule } from '../../directives/blog-link/blog-link.module'
import { ReuseableRouteType } from '../../services/routing.service'
const routes: Routes = [
  {
    path: '',
    component: SearchComponent,
    data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
  },
  {
    path: ':term',
    component: SearchComponent,
    data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
  }
]

@NgModule({
  declarations: [SearchComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes),
    PostModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FontAwesomeModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    BlogLinkModule,
    MatExpansionModule,
    UserSelectorComponent,
    TranslateModule
  ]
})
export class SearchModule {}
