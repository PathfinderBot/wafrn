import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatInputModule } from '@angular/material/input'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { AdminService } from 'src/app/services/admin.service'
import { MessageService } from 'src/app/services/message.service'
import { SimpleTitleService } from 'src/app/services/simple-title.service'
import { InjectHtmlModule } from "src/app/directives/inject-html/inject-html.module";

@Component({
  selector: 'app-email-campaign',
  imports: [FormsModule, MatButtonModule, MatCardModule, MatInputModule, MatProgressBarModule, InjectHtmlModule],
  templateUrl: './email-campaign.component.html',
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

    simpleTitle.set('Email campaign')
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
        summary: response.success ? 'Campaign succesfuly sent' : 'error',
      })
    } catch (error) {
      console.error(error)
      this.messages.add({
        severity: 'error',
        summary: 'Something went wrong'
      })
    } finally {
      this.ready = true
      this.cdr.detectChanges()
    }
  }
}
