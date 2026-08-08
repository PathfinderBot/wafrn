import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule, ReactiveFormsModule, UntypedFormGroup, UntypedFormControl, Validators } from '@angular/forms'
import { MatCardModule } from '@angular/material/card'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatButtonModule } from '@angular/material/button'
import { MatSelectModule } from '@angular/material/select'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { faUser } from '@fortawesome/free-solid-svg-icons'
import encodeQR from 'qr'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

@Component({
  selector: 'app-mfa-setup',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    FontAwesomeModule,
    TranslateModule
  ],
  templateUrl: './mfa-setup.component.html',
  styleUrls: ['./mfa-setup.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class MfaSetupComponent {
  private loginService = inject(LoginService)
  private messageService = inject(MessageService)
  private translateService = inject(TranslateService)

  loading = false
  logo = EnvironmentService.environment.logo
  icon = faUser
  mfaList: any[] | null = null

  mfaForm = new UntypedFormGroup({
    type: new UntypedFormControl('totp', [Validators.required]),
    name: new UntypedFormControl('', [Validators.required])
  })

  mfaVerifyDetails: any = null
  mfaVerifyQrCode: any = null

  mfaVerifyForm = new UntypedFormGroup({
    token: new UntypedFormControl('', [Validators.required])
  })

  async ngOnInit() {
    this.mfaList = await this.loginService.getUserMfaList()
  }

  async onSubmit() {
    this.loading = true
    if (!this.mfaVerifyDetails) {
      this.mfaVerifyDetails = await this.loginService.createNewMfa(this.mfaForm)
      const imageData = encodeQR(this.mfaVerifyDetails?.qrString, 'svg')
      this.mfaVerifyQrCode = 'data:image/svg+xml;base64,' + btoa(imageData)
    } else {
      let success = await this.loginService.verifyMfa(this.mfaVerifyDetails.id, this.mfaVerifyForm)
      if (success) {
        this.mfaVerifyDetails = null
        this.mfaList = await this.loginService.getUserMfaList()
        this.mfaForm.reset()
        this.mfaVerifyForm.reset()
      }
    }
    this.loading = false
  }

  async deleteMfa(mfa: any) {
    this.translateService.get('profile.security.mfa.confirmDeleteMessage').subscribe(async (res: string) => {
      if (confirm(res)) {
        await this.loginService.deleteMfa(mfa.id)
        this.mfaList = await this.loginService.getUserMfaList()
      }
    })
  }
}
