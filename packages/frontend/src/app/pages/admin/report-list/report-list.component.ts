import {
  Component,
  computed,
  OnInit,
  signal,
  viewChild,
  WritableSignal,
  inject,
  ChangeDetectionStrategy
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { MatCardModule } from '@angular/material/card'
import { MatInputModule } from '@angular/material/input'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatButtonModule } from '@angular/material/button'
import { MatExpansionModule } from '@angular/material/expansion'
import { TranslateModule } from '@ngx-translate/core'
import { AvatarSmallComponent } from '../../../components/avatar-small/avatar-small.component'
import { ReportFilter, parseReportFilter } from '../../../grammars/report-grammar'
import { AdminService, UserReport } from '../../../services/admin.service'
import { DeletePostService } from '../../../services/delete-post.service'
import { SimpleDialogService } from '../../../services/simple-dialog.service'
import { SimpleTitleService } from '../../../services/simple-title.service'

@Component({
  selector: 'app-report-list',
  imports: [
    CommonModule,
    RouterModule,
    MatTableModule,
    FormsModule,
    MatCardModule,
    MatPaginatorModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    AvatarSmallComponent,
    TranslateModule,
    MatExpansionModule
  ],
  templateUrl: './report-list.component.html',
  styleUrls: ['./report-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class ReportListComponent implements OnInit {
  private adminService = inject(AdminService)
  private simpleDialog = inject(SimpleDialogService)
  private deletePostService = inject(DeletePostService)

  reportDataSource = new MatTableDataSource<UserReport, MatPaginator>()
  reportPaginator = viewChild.required<MatPaginator>('reportPaginator')
  displayedColumns = ['user', 'reportedUser', 'report', 'solved', 'date', 'actions']

  searchFilters: WritableSignal<ReportFilter> = signal([], {
    equal: () => false
  })
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

  constructor() {
    const simpleTitle = inject(SimpleTitleService)

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
        content: 'admin.confirmBanContentBluesky'
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

  async forceCw(postId: string) {
    let confirm = false
    let reason = ''
    const dialogRes = await this.simpleDialog.createPromptDialog({
      title: 'dialog.admin.promptForceCwPostTitle',
      titleSuffix: '',
      content: 'dialog.admin.promptForceCwPostDescription',
      label: ''
    })
    if (!dialogRes?.confirmed) {
      return
    }
    reason = dialogRes.value
    await this.adminService.forceCWPost(postId, reason)
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

  async reopen(report: UserReport) {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.admin.confirmReopenTitle'
    })

    if (!confirm) return

    await this.adminService.reopenReport(report.id)
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
    // Future translators I apologize for my string building crimes
    return filters.map((group) => {
      const groupType = group[0].type

      // Flags are the only entry of a group
      if (groupType === 'flag') {
        return `${group[0].mode === '+' ? 'is' : 'is not'} ${this.filterMap[group[0].value]}`
      }

      return `${this.filterMap[group[0].key]} ${group[0].mode === '+' ? 'is' : 'is not'} \
${group.length !== 1 ? '(' : ''}\
${group.map((filter) => filter.value).join(' or ')}\
${group.length !== 1 ? ')' : ''}`
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
    const entryMatches = match.filter.every((group) =>
      group.some((entry) => {
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
    )

    this.searchFilters.set(match.filter)

    return entryMatches
  }

  async deletePost(id: string) {
    await this.deletePostService.deletePost(id)
    this.loadReports()
  }
}
