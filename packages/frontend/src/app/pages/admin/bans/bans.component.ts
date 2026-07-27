import { Component, viewChild, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatSortModule } from '@angular/material/sort'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { RouterModule } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { AvatarSmallComponent } from 'src/app/components/avatar-small/avatar-small.component'
import { AdminService, UserBan } from 'src/app/services/admin.service'
import { SimpleDialogService } from 'src/app/services/simple-dialog.service'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

@Component({
  selector: 'app-bans',
  imports: [
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatButtonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    AvatarSmallComponent,
    MatProgressBarModule,
    TranslatePipe
  ],
  templateUrl: './bans.component.html',
  styleUrls: ['./bans.component.scss']
})
export class BansComponent {
  private adminService = inject(AdminService)
  private simpleDialog = inject(SimpleDialogService)

  showBans = false
  bannedUsers = new MatTableDataSource<UserBan | null, MatPaginator>(undefined)
  bannedUsersPaginator = viewChild.required<MatPaginator>(MatPaginator)
  bannedUsersColumns = ['user', 'actions']

  placeholderData = [null]

  loading = true

  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.admin.bans')
  }

  async ngOnInit() {
    const res: { users: UserBan[] } = await this.adminService.banList()

    this.bannedUsers.data = res.users
    this.bannedUsers.filterPredicate = (ban, filter) => ban?.url?.startsWith(filter) ?? false
    this.bannedUsers.paginator = this.bannedUsersPaginator()

    this.loading = false
  }

  onChange(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.bannedUsers.filter = target.value
    }
  }

  async unban(ban: UserBan) {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.admin.confirmUnbanTitle',
      titleSuffix: ban.url ?? '',
      content: 'dialog.admin.confirmUnbanContent'
    })

    if (!confirm) return

    this.loading = true
    if (ban.id) {
      const res: { users: UserBan[] } = await this.adminService.unbanUser(ban.id)
      this.bannedUsers.data = res.users
    }
    this.loading = false
  }
}
