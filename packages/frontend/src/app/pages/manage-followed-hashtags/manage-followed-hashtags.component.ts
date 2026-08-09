import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { RouterModule } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { LoaderComponent } from '../../components/loader/loader.component'
import { DashboardService } from '../../services/dashboard.service'
import { MessageService } from '../../services/message.service'
import { UserOptionsService } from '../../services/user-options.service'
import { SimpleTitleService } from '../../services/simple-title.service'

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
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './manage-followed-hashtags.component.scss'
})
export class ManageFollowedHashtagsComponent {
  userOptionsService = inject(UserOptionsService)
  private dashboardService = inject(DashboardService)
  private messageService = inject(MessageService)
  private translateService = inject(TranslateService)

  loading = true
  tag = ''
  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.settings.followedHashtags')
    // we force update of the lists
    this.userOptionsService.loadFollowers().then(() => {
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
    await this.userOptionsService.loadFollowers()
    this.loading = false
  }
}
