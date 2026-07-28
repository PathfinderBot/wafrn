import { ChangeDetectorRef, Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatInputModule } from '@angular/material/input'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { TranslateModule } from '@ngx-translate/core'
import { InjectHtmlModule } from '../../../directives/inject-html/inject-html.module'
import { AdminService } from '../../../services/admin.service'
import { MessageService } from '../../../services/message.service'
import { SimpleTitleService } from '../../../services/simple-title.service'

@Component({
  selector: 'app-email-campaign',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatInputModule,
    MatProgressBarModule,
    InjectHtmlModule,
    TranslateModule
  ],
  templateUrl: './email-campaign.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './email-campaign.component.scss'
})
export class EmailCampaignComponent {
  private adminService = inject(AdminService)
  private messages = inject(MessageService)
  private cdr = inject(ChangeDetectorRef)

  subject = ''
  body = ''
  ready = true
  lastJobId = ''

  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('admin.emailCampaign.title')
  }

  get canSubmit() {
    return this.ready && !!this.subject.trim() && !!this.body.trim()
  }

  async submit(test: boolean) {
    if (!this.canSubmit) {
      return
    }

    this.ready = false
    this.lastJobId = ''

    try {
      const response = await this.adminService.sendEmailCampaign({
        subject: this.subject.trim(),
        body: this.body.trim(),
        test: test
      })
      this.messages.add({
        severity: response.success ? 'success' : 'error',
        summary: response.success ? 'admin.emailCampaign.messages.success' : 'admin.emailCampaign.messages.error',
        translate: true
      })
    } catch (error) {
      console.error(error)
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    } finally {
      this.ready = true
      this.cdr.detectChanges()
    }
  }
}
