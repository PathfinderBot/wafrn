import { Component, computed, OnInit, signal, viewChild, WritableSignal } from '@angular/core'
import { MatPaginator } from '@angular/material/paginator'
import { MatTableDataSource } from '@angular/material/table'
import { parseReportFilter, ReportFilter } from 'src/app/grammars/report-grammar'
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
  displayedColumns = ['user', 'reportedUser', 'report', 'solved', 'date', 'actions']

  searchFilters: WritableSignal<ReportFilter> = signal([], { equal: () => false })
  advancedSearch = computed(() => this.searchFilters().length !== 0)

  loading = signal(false) // Not actually used, but could have a loader inside the table

  reportMap: { [index: number]: string } = {
    1: 'SPAM',
    3: 'Unlabeled NSFW',
    5: 'Hate',
    10: 'Illegal'
  }

  filterMap: Record<string, string> = {
    t: 'target',
    target: 'target',
    r: 'reporter',
    reporter: 'reporter',
    d: 'resolved',
    resolved: 'resolved'
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
    this.reportDataSource.filterPredicate = this.filterReport.bind(this)
    this.reportDataSource.paginator = this.reportPaginator()
  }

  async loadReports() {
    this.loading.set(false)
    const res = await this.adminService.getReports()
    console.log(res)
    res
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .sort((a, b) => +a.resolved - +b.resolved)
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

  updateMode(event: Event) {
    const target = event.target
    if (!target || !(target instanceof HTMLInputElement)) return
    if (target.value === '') {
      this.searchFilters.set([])
    }
  }

  mapReport(key: number) {
    return this.reportMap[key] ?? 'unknown'
  }

  mapSeverity(key: number): number {
    // Hard coding 10 as max severity
    return key / 10
  }

  mapFilters(filters: ReportFilter) {
    return filters.map((filter) => {
      if (filter.type === 'flag') {
        return `${filter.mode === '+' ? 'is' : 'is not'} ${this.filterMap[filter.value]}`
      } else {
        return `${this.filterMap[filter.key]} ${filter.mode === '+' ? 'is' : 'is not'} ${filter.value}`
      }
    })
  }

  filterReport(report: UserReport, query: string): boolean {
    const match = parseReportFilter(query)

    // Basic search (full text query)
    if (!match.succeeded) {
      this.searchFilters.set([])
      return (
        report.user.url.startsWith(query) ||
        report.reportedUser.url.startsWith(query) ||
        report.severity.toString() === query ||
        report.description.includes(query)
      )
    }

    // Advanced search
    //
    // Combining add and remove of the same filter just hides everything
    // The if statements have to check evil statements to implement
    const entryMatches = match.filter.every((entry) => {
      let reportMatch: boolean // evil global
      if (entry.type === 'flag') {
        // Expandable idk
        switch (entry.value) {
          case 'd':
          case 'resolved':
            reportMatch = report.resolved
            if ((entry.mode === '+' && reportMatch) || (entry.mode === '-' && !reportMatch)) return true
            break
        }
        return false
      } else {
        switch (entry.key) {
          case 'r':
          case 'reporter':
            reportMatch = report.user.url === entry.value
            if ((entry.mode === '+' && reportMatch) || (entry.mode === '-' && !reportMatch)) return true
            break
          case 't':
          case 'target':
            reportMatch = report.reportedUser.url === entry.value
            if ((entry.mode === '+' && reportMatch) || (entry.mode === '-' && !reportMatch)) return true
            break
        }
        return false
      }
    })

    this.searchFilters.set(match.filter)

    return entryMatches
  }
}
