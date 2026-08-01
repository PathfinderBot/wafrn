import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatButtonModule } from '@angular/material/button'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { faLock, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'

import { Router } from '@angular/router'
import { ReactiveFormsModule, UntypedFormGroup, UntypedFormControl, Validators } from '@angular/forms'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

@Component({
  selector: 'app-update-email',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FontAwesomeModule,
    TranslateModule
  ],
  templateUrl: './update-email.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './update-email.component.scss'
})
export class UpdateEmailComponent {
  private loginService = inject(LoginService)
  private messageService = inject(MessageService)
  private translateService = inject(TranslateService)
  private router = inject(Router)

  loading = false
  icon = faLock
  showPassword = false
  faEye = faEye
  faEyeSlash = faEyeSlash

  emailForm = new UntypedFormGroup({
    password: new UntypedFormControl('', [Validators.required]),
    email: new UntypedFormControl('', [Validators.required, Validators.email])
  })

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword
  }

  async onSubmit() {
    if (!this.emailForm.valid) {
      return
    }

    this.loading = true
    try {
      const result = await this.loginService.updateEmail(
        this.emailForm.get('password')?.value,
        this.emailForm.get('email')?.value
      )

      if (result) {
        this.translateService.get('settings.changeEmailSuccess').subscribe((res: string) => {
          this.messageService.add({
            severity: 'success',
            summary: res
          })
        })
        await this.router.navigate(['/dashboard'])
      } else {
        this.translateService.get('settings.changeEmailError').subscribe((res: string) => {
          this.messageService.add({
            severity: 'error',
            summary: res
          })
        })
      }
    } catch (error) {
      console.error(error)
      this.translateService.get('settings.changeEmailError').subscribe((res: string) => {
        this.messageService.add({
          severity: 'error',
          summary: res
        })
      })
    } finally {
      this.loading = false
    }
  }
}
