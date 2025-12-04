import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { UntypedFormGroup } from '@angular/forms'
import { ProcessedPost } from '../interfaces/processed-post'
import { MatDialog } from '@angular/material/dialog'
import { EnvironmentService } from './environment.service'
import { lastValueFrom } from 'rxjs'
import { ReportDialogData, ReportPostComponent } from '../components/report-post/report-post.component'
import { UserReport } from '../interfaces/report'
import { BlocksService } from './blocks.service'
import { MessageService } from './message.service'

type UserId = string

@Injectable({
  providedIn: 'any'
})
export class ReportService {
  private http = inject(HttpClient);
  private dialogService = inject(MatDialog);
  private messages = inject(MessageService);
  private blockService = inject(BlocksService);


  async report(data: ProcessedPost | UserId) {
    let res: (UserReport & { block: boolean }) | undefined
    if (typeof data === 'object') {
      res = await this.openReportPostDialog({ type: 'post', post: data })
    } else {
      res = await this.openReportPostDialog({ type: 'user', userId: data })
    }

    if (res === undefined) return

    if (res.block && res.userId) {
      // HACK: this is not coupled with the report so you can possibly block but not report.
      this.blockService.blockUser(res.userId, 'USER WAS BLOCKED WHILE REPORTING')
    }

    const reportData: UserReport = res
    const reportRes = await lastValueFrom(
      this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/reportPost`, reportData)
    )

    // HACK: reportPost endpoint API is weird
    if (reportRes.success !== false) {
      this.messages.add({
        severity: 'success',
        summary: typeof data === 'object' ? 'messages.reportPostSuccess' : 'messages.reportUserSuccess',
        translate: true
      })
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
  }

  async openReportPostDialog(data: ReportDialogData) {
    const { ReportPostComponent } = await import('../components/report-post/report-post.component')
    const ref = this.dialogService.open<
      ReportPostComponent,
      ReportDialogData,
      (UserReport & { block: boolean }) | undefined
    >(ReportPostComponent, {
      width: '600px',
      data
    })

    const res = await lastValueFrom(ref.afterClosed())
    return res
  }
}
