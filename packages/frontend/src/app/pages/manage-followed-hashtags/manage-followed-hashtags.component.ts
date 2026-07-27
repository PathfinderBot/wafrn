import { Component, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { RouterModule } from '@angular/router'
import { LoaderComponent } from 'src/app/components/loader/loader.component'
import { DashboardService } from 'src/app/services/dashboard.service'
import { MessageService } from 'src/app/services/message.service'
import { PostsService } from 'src/app/services/posts.service'
import { SimpleTitleService } from 'src/app/services/simple-title.service'
import { TranslateModule, TranslateService } from '@ngx-translate/core'

@Component({
  selector: 'app-manage-followed-hashtags',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    RouterModule,
    MatButtonModule,
    LoaderComponent,
    MatFormFieldModule,
    MatInputModule,
    TranslateModule
  ],
  templateUrl: './manage-followed-hashtags.component.html',
  styleUrl: './manage-followed-hashtags.component.scss'
})
export class ManageFollowedHashtagsComponent {
  postsService = inject(PostsService)
  private dashboardService = inject(DashboardService)
  private messageService = inject(MessageService)
  private translateService = inject(TranslateService)

  loading = true
  tag = ''
  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.settings.followedHashtags')
    // we force update of the lists
    this.postsService.loadFollowers().then(() => {
      this.loading = false
    })
  }

  async updateHashtag(tag: string, follow: boolean) {
    this.loading = true
    if (follow) {
      this.tag = ''
    }
    const success = await this.dashboardService.manageHashtagSubscription(tag, follow)
    this.messageService.add({
      severity: success ? 'success' : 'error',
      summary: success
        ? this.translateService.instant(
            follow ? 'manageFollowedHashtags.messages.followed' : 'manageFollowedHashtags.messages.unfollowed',
            { tag }
          )
        : this.translateService.instant('manageFollowedHashtags.messages.error')
    })
    await this.postsService.loadFollowers()
    this.loading = false
  }
}
