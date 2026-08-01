import { Component, Inject, OnInit, ChangeDetectionStrategy } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInput } from '@angular/material/input'
import { TranslateModule } from '@ngx-translate/core'
import { BlogDetails } from '../../interfaces/blogDetails'
import { AdminService } from '../../services/admin.service'
import { BlogService } from '../../services/blog.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'
import { ParticleService } from '../../services/particle.service'

@Component({
  selector: 'app-add-invite-code',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatInput,
    MatFormFieldModule,
    MatButtonModule,
    TranslateModule,
    MatCheckboxModule,
    MatDatepicker,
    MatDatepickerModule
  ],
  templateUrl: './add-invite-code.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './add-invite-code.component.scss'
})
export class AddInviteCodeComponent implements OnInit {
  allowAnons = false
  constructor(
    private dialogRef: MatDialogRef<AddInviteCodeComponent>,
    private messages: MessageService,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      details: BlogDetails
    },
    private blogService: BlogService,
    protected loginService: LoginService,
    private particle: ParticleService,
    protected adminService: AdminService
  ) {}
  ngOnInit(): void {
    const allowAnonsOption = this.data.details.publicOptions.find((elem) => elem.optionName === 'wafrn.public.asks')
    if (allowAnonsOption) {
      this.allowAnons = allowAnonsOption.optionValue == '1'
    }
  }

  addInviteCode = new FormGroup({
    code: new FormControl('', [Validators.minLength(6)]),
    expirationDate: new FormControl(
      (() => {
        const currentDate = new Date()
        currentDate.setDate(currentDate.getDate() + 7)
        return currentDate
      })()
    )
  })

  async onSubmit() {
    const res = await this.adminService.addInviteCode(
      this.addInviteCode.value.code ?? undefined,
      this.addInviteCode.value.expirationDate ?? undefined
    )
    if (res) {
      this.messages.add({
        severity: 'success',
        summary: 'Created invite code!'
      })
      this.dialogRef.close()
      window.location.reload()
    }
  }
}
