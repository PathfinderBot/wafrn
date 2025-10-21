import { Component, OnInit, signal, viewChild, ViewChild } from '@angular/core'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort } from '@angular/material/sort'
import { MatTableDataSource } from '@angular/material/table'
import { AdminService, UserReport } from 'src/app/services/admin.service'
import { SimpleDialogService } from 'src/app/services/simple-dialog.service'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

@Component({
  selector: 'app-report-list',
  templateUrl: './report-list.component.html',
  styleUrls: ['./report-list.component.scss'],
  standalone: false
})
export class ReportListComponent implements OnInit {
  reportDataSource = new MatTableDataSource<UserReport, MatPaginator>()
  reportPaginator = viewChild.required<MatPaginator>('reportPaginator')
  reportSort = viewChild.required<MatSort>('reportSort')
  displayedColumns = ['user', 'reportedUser', 'report', 'solved', 'actions']

  loading = signal(false) // Not actually used, but could have a loader inside the table

  reportMap: { [index: number]: string } = {
    1: 'SPAM',
    3: 'Unlabeled NSFW',
    5: 'Hate',
    10: 'Illegal'
  }

  constructor(
    private adminService: AdminService,
    private simpleDialog: SimpleDialogService,
    simpleTitle: SimpleTitleService
  ) {
    simpleTitle.set('menu.admin.reports')

    this.loadReports()
  }

  ngOnInit(): void {
    this.reportDataSource.sort = this.reportSort()
    this.reportDataSource.filterPredicate = (report, filter) =>
      report.user.url.startsWith(filter) ||
      report.reportedUser.url.startsWith(filter) ||
      report.severity.toString() === filter ||
      report.description.includes(filter)
    this.reportDataSource.paginator = this.reportPaginator()
  }

  async loadReports() {
    this.loading.set(false)
    const res = await this.adminService.getReports()
    res.sort((a, b) => +a.resolved - +b.resolved)
    this.reportDataSource.data = res
    this.loading.set(true)
  }

  async ignore(report: UserReport) {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.admin.confirmIgnoreTitle',
      titleSuffix: `${this.mapReport(report.severity)}`,
      content: 'dialog.admin.confirmIgnoreContent',
      contentSuffix: report.description
    })

    if (!confirm) return

    await this.adminService.ignoreReport(report.id)
    this.loadReports()
  }

  async ban(report: UserReport) {
    let confirm = false
    let reason = ''

    // BSKY users do not get a reason I guess
    const blueskyUser = report.reportedUser.url.startsWith('@')
    if (blueskyUser) {
      const confirmRes = await this.simpleDialog.createConfirmDialog({
        title: 'dialog.admin.confirmBanTitle',
        titleSuffix: report.reportedUser.url,
        content: 'confirmBanContentBluesky'
      })
      confirm = confirmRes ?? false
    } else {
      const banRes = await this.simpleDialog.createPromptDialog({
        title: 'dialog.admin.promptBanTitle',
        titleSuffix: report.reportedUser.url,
        content: 'dialog.admin.promptBanReasonDescription',
        label: 'dialog.admin.promptBanReasonLabel'
      })

      if (!banRes?.confirmed) return

      reason = banRes.value
      const confirmRes = await this.simpleDialog.createConfirmDialog({
        title: 'dialog.admin.confirmBanTitle',
        titleSuffix: report.reportedUser.url,
        content: 'dialog.admin.confirmBanContentFedi',
        contentSuffix: reason
      })
      confirm = confirmRes ?? false
    }

    if (!confirm) return

    await this.adminService.banUser(report.reportedUser.id, reason)
    this.loadReports()
  }

  async forceNSFW(report: UserReport) {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.admin.confirmNSFWTitle',
      titleSuffix: report.reportedUser.url,
      content: 'dialog.admin.confirmNSFWContent'
    })

    if (!confirm) return

    await this.adminService.forceNSFWUser(report.reportedUser.id)
    this.loadReports()
  }

  mapReport(key: number) {
    return this.reportMap[key] ?? 'unknown'
  }

  mapSeverity(key: number): number {
    // Hard coding 10 as max severity
    return key / 10
  }
}
