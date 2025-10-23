import { Component, Inject, OnInit, Signal } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, UntypedFormGroup, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInput } from '@angular/material/input'
import { BlogDetails } from 'src/app/interfaces/blogDetails'
import { BlogService } from 'src/app/services/blog.service'
import { LoginService } from 'src/app/services/login.service'
import { MessageService } from 'src/app/services/message.service'
import { InfoCardComponent } from '../info-card/info-card.component'
import { TranslateModule } from '@ngx-translate/core'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { ParticleService } from 'src/app/services/particle.service'

@Component({
  selector: 'app-ask-dialog-content',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatInput,
    MatFormFieldModule,
    MatButtonModule,
    TranslateModule,
    MatCheckboxModule
  ],
  templateUrl: './ask-dialog-content.component.html',
  styleUrl: './ask-dialog-content.component.scss'
})
export class AskDialogContentComponent implements OnInit {
  allowAnons = false
  constructor(
    private dialogRef: MatDialogRef<AskDialogContentComponent>,
    private messages: MessageService,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      details: BlogDetails
    },
    private blogService: BlogService,
    protected loginService: LoginService,
    private particle: ParticleService
  ) {
    this.askForm.controls['anonymous'].patchValue(!this.loginService.loggedIn.value)
  }
  ngOnInit(): void {
    const allowAnonsOption = this.data.details.publicOptions.find((elem) => elem.optionName === 'wafrn.public.asks')
    if (allowAnonsOption) {
      this.allowAnons = allowAnonsOption.optionValue == '1'
    }
  }

  askForm = new FormGroup({
    question: new FormControl('', [Validators.required, Validators.minLength(1)]),
    anonymous: new FormControl(true)
  })

  async onSubmit() {
    const res: any = await this.blogService.askuser(this.data.details.url, this.askForm.value)
    if (res.success) {
      this.messages.add({
        severity: 'success',
        summary: 'You asked the user!'
      })
      this.particle.emojiReact('❓')
      this.dialogRef.close()
    } else {
      this.messages.add({ severity: 'error', summary: 'Something went wrong' })
    }
  }
}
