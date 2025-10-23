import { CommonModule } from '@angular/common'
import { Component, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { LoaderComponent } from 'src/app/components/loader/loader.component'
import { EnvironmentService } from 'src/app/services/environment.service'
import { LoginService } from 'src/app/services/login.service'
import { MessageService } from 'src/app/services/message.service'

@Component({
  selector: 'app-migrate-bluesky',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    FontAwesomeModule,
    LoaderComponent
  ],
  templateUrl: './migrate-bluesky.component.html',
  styleUrl: './migrate-bluesky.component.scss'
})
export class MigrateBlueskyComponent {
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

  constructor(
    private environmentService: EnvironmentService,
    private loginService: LoginService,
    private messageService: MessageService
  ) {}

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
          summary: 'Account not found, try wihout the @'
        })
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Account found, but please do check password'
        })
      }
      this.loading = false
      console.log(error)
      return
    }

    this.messageService.add({
      severity: 'success',
      summary: 'Account sincronized succesfuly'
    })
  }
}
