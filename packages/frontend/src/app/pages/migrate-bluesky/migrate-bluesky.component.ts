import { Component, signal, inject, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule, ReactiveFormsModule, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatStepperModule } from '@angular/material/stepper'
import { MatIconModule } from '@angular/material/icon'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

@Component({
  selector: 'app-migrate-bluesky',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatStepperModule,
    FontAwesomeModule,
    MatIconModule,
    TranslateModule
  ],
  templateUrl: './migrate-bluesky.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './migrate-bluesky.component.scss'
})
export class MigrateBlueskyComponent {
  private environmentService = inject(EnvironmentService)
  private loginService = inject(LoginService)
  private messageService = inject(MessageService)
  private translateService = inject(TranslateService)

  environment = signal<any>(EnvironmentService.environment)

  loading = false
  code = ''
  isPasswordVisible = false
  faEyeSlash = faEyeSlash
  faEye = faEye

  bskyForm = new UntypedFormGroup({
    account: new UntypedFormControl('', [Validators.required]),
    password: new UntypedFormControl('', [Validators.required])
  })

  loadInviteCode() {
    this.loginService.getBskyInviteCode().then((code) => {
      this.code = code
    })
  }

  togglePasswordVisibility() {
    this.isPasswordVisible = !this.isPasswordVisible
  }

  async linkBskyAccount() {
    this.loading = true
    try {
      await this.loginService.linkBskyAccount(this.bskyForm.value.account, this.bskyForm.value.password)
    } catch (error: any) {
      if (error.status == 404) {
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('migrateBluesky.messages.accountNotFound')
        })
      } else {
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('migrateBluesky.messages.checkPassword')
        })
      }
      this.loading = false
      console.log(error)
      return
    }

    this.messageService.add({
      severity: 'success',
      summary: this.translateService.instant('migrateBluesky.messages.accountSynchronized')
    })
  }
}
