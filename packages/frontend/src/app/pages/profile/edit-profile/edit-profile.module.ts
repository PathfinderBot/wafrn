import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { EditProfileComponent } from './edit-profile.component'
import { RouterModule, Routes } from '@angular/router'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatTabsModule } from '@angular/material/tabs'
import { MatExpansionModule } from '@angular/material/expansion'
import { TranslateModule } from '@ngx-translate/core'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { EmojiCollectionsComponent } from '../../../components/emoji-collections/emoji-collections.component'
import { UserSelectorComponent } from '../../../components/user-selector/user-selector.component'
import { loginRequiredGuard } from '../../../guards/login-required.guard'

const routes: Routes = [
  {
    path: '',
    component: EditProfileComponent,
    canActivate: [loginRequiredGuard]
  }
]

@NgModule({
  declarations: [EditProfileComponent],
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    EmojiCollectionsComponent,
    MatExpansionModule,
    TranslateModule,
    MatTabsModule,
    UserSelectorComponent,
    MatProgressSpinnerModule,
    FontAwesomeModule
  ]
})
export class EditProfileModule {}
