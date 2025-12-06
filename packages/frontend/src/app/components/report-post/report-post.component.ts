import { Component, computed, signal, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox'
import {
  MatDialogActions,
  MatDialogTitle,
  MatDialogContent,
  MatDialogRef,
  MAT_DIALOG_DATA
} from '@angular/material/dialog'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { TranslatePipe } from '@ngx-translate/core'
import { ProcessedPost } from 'src/app/interfaces/processed-post'
import { UserReport } from 'src/app/interfaces/report'
import { KeyValueTypedPipe } from 'src/app/pipes/keyvaluetyped.pipe'

export type ReportDialogData = { type: 'post'; post: ProcessedPost } | { type: 'user'; userId: string }

@Component({
  selector: 'app-report-post',
  templateUrl: './report-post.component.html',
  styleUrls: ['./report-post.component.scss'],
  imports: [
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatDialogActions,
    MatDialogTitle,
    MatDialogContent,
    TranslatePipe,
    KeyValueTypedPipe
  ]
})
export class ReportPostComponent {
  private readonly dialogRef = inject<MatDialogRef<ReportPostComponent, UserReport | undefined>>(MatDialogRef);
  data = inject<ReportDialogData>(MAT_DIALOG_DATA);

  formValid = computed<boolean>(() => this.reportSeverity() !== null && this.reportDescription().length > 0)
  postId: string | undefined
  userId: string

  reportSeverity = signal<number | null>(null)
  reportDescription = signal<string>('')

  blockUser = false

  reportOptions: Record<number, string> = {
    1: 'Spam',
    3: 'Unlabeled NSFW',
    5: 'Inciting hate against a person or collective',
    10: 'Illegal content'
  }

  constructor() {
    const data = this.data;

    this.postId = data.type === 'post' ? data.post.id : undefined
    this.userId = data.type === 'user' ? data.userId : data.post.userId
  }

  onInput(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.reportDescription.set(target.value)
    }
  }

  onCheck(event: MatCheckboxChange) {
    this.blockUser = event.checked
  }

  onCancel() {
    this.dialogRef.close(undefined)
  }

  onConfirm() {
    const report: UserReport & { block: boolean } = {
      postId: this.postId,
      userId: this.userId,
      severity: this.reportSeverity() as number,
      description: this.reportDescription(),
      block: this.blockUser
    }
    this.dialogRef.close(report)
  }
}
