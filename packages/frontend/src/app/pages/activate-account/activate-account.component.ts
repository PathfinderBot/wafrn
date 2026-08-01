import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

@Component({
  selector: 'app-activate-account',
  templateUrl: './activate-account.component.html',
  styleUrls: ['./activate-account.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ActivateAccountComponent implements OnInit {
  private activeRoute = inject(ActivatedRoute)
  private loginService = inject(LoginService)
  private messageService = inject(MessageService)

  logo = EnvironmentService.environment.logo
  message = 'loading'

  ngOnInit(): void {
    this.activateAccount()
      .then(() => {
        this.messageService.add({
          severity: 'success',
          summary: 'Your email was verified'
        })
        this.message = 'Your email was verified!'
      })
      .catch((error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Something went wrong'
        })
        this.message = `Something went wrong! Try again in a few minutes and if it does not work please send an email to the administrator of the instance`
      })
  }

  async activateAccount() {
    const params: any = this.activeRoute.snapshot.params
    await this.loginService.activateAccount(params.email, params.activationCode)
  }
}
