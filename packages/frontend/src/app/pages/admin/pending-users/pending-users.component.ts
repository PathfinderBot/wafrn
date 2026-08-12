import { Component, signal, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { TranslateModule } from '@ngx-translate/core'
import { LoaderComponent } from '../../../components/loader/loader.component'
import { SimplifiedUser } from '../../../interfaces/simplified-user'
import { AdminService } from '../../../services/admin.service'
import { EnvironmentService } from '../../../services/environment.service'
import { SimpleDialogService } from '../../../services/simple-dialog.service'
import { SimpleTitleService } from '../../../services/simple-title.service'

@Component({
  selector: 'app-pending-users',
  imports: [MatButtonModule, MatCardModule, LoaderComponent, TranslateModule],
  templateUrl: './pending-users.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './pending-users.component.scss'
})
export class PendingUsersComponent {
  private adminService = inject(AdminService)
  private simpleDialog = inject(SimpleDialogService)
  private cdr = inject(ChangeDetectorRef)

  pendingUsers: SimplifiedUser[] = []
  loading = signal(true)

  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.admin.awaitingAproval')

    this.reloadList()
  }

  async activateUser(user: SimplifiedUser) {
    await this.adminService.activateUser(user.id)
    this.reloadList()
  }

  async requireExtra(user: SimplifiedUser) {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.admin.requireExtraStepsTitle',
      content: 'dialog.admin.requireExtraStepsDescription'
    })

    if (!confirm) return

    await this.adminService.requireExtraSteps(user.id)
    this.reloadList()
  }

  async userUsedVPN(user: SimplifiedUser) {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.admin.userUsedVPNTitle',
      content: 'dialog.admin.userUsedVPNDescription'
    })

    if (!confirm) return

    await this.adminService.userUsedVPN(user.id)
    this.reloadList()
  }

  async rejectUser(user: SimplifiedUser) {
    const res = await this.simpleDialog.createPromptDialog({
      title: 'dialog.admin.rejectUserTitle',
      titleSuffix: user.url,
      content: 'dialog.admin.rejectUserReasonDescription',
      label: 'dialog.admin.rejectUserReasonLabel'
    })

    if (!res?.confirmed || !res.value) return

    await this.adminService.rejectUser(user.id, res.value)
    this.reloadList()
  }

  async blockIp(user: SimplifiedUser) {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.admin.blockIpTitle',
      content: 'dialog.admin.blockIpDescription'
    })

    if (!confirm) return

    await this.adminService.blockIp(user.registerIp as string)
    await this.userUsedVPN(user)
    window.location.reload()
  }

  async reloadList() {
    this.pendingUsers = []
    await this.adminService.getPendingActivationUsers().then((response) => {
      this.pendingUsers = response.map((elem) => {
        elem.avatar = EnvironmentService.environment.baseMediaUrl + elem.avatar
        elem.registerIp = elem.registerIp?.split(',')[0]
        return elem
      })
    })
    this.loading.set(false)
    this.cdr.detectChanges()
  }
}
