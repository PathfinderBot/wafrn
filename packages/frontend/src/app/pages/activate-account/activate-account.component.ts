import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core'
import { ActivatedRoute, RouterModule } from '@angular/router'
import { MatButtonModule } from '@angular/material/button'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

@Component({
  selector: 'app-activate-account',
  imports: [RouterModule, MatButtonModule, TranslateModule],
  templateUrl: './activate-account.component.html',
  styleUrls: ['./activate-account.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class ActivateAccountComponent implements OnInit {
  private activeRoute = inject(ActivatedRoute)
  private loginService = inject(LoginService)
  private messageService = inject(MessageService)
  private translateService = inject(TranslateService)

  logo = EnvironmentService.environment.logo
  message = 'loading'
  // once activation succeeds, the user can't log in yet if this instance reviews registrations
  showLoginLink = false

  ngOnInit(): void {
    this.activateAccount()
  }

  async activateAccount() {
    const params: any = this.activeRoute.snapshot.params
    try {
      const success = await this.loginService.activateAccount(params.email, params.activationCode)
      if (success) {
        const pendingApproval = EnvironmentService.environment.reviewRegistrations
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant('login.emailVerified')
        })
        this.message = this.translateService.instant(
          pendingApproval ? 'login.emailVerifiedPendingApproval' : 'login.emailVerifiedCanLogIn'
        )
        this.showLoginLink = !pendingApproval
      } else {
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('login.activationFailedTitle')
        })
        this.message = this.translateService.instant('login.activationFailedMessage')
      }
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('login.activationFailedTitle')
      })
      this.message = this.translateService.instant('login.activationErrorMessage')
    }
  }
}
