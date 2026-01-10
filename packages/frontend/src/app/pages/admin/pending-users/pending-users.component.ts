import { Component, signal, inject, ChangeDetectorRef } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { TranslateModule } from '@ngx-translate/core'
import { LoaderComponent } from 'src/app/components/loader/loader.component'
import { SimplifiedUser } from 'src/app/interfaces/simplified-user'
import { AdminService } from 'src/app/services/admin.service'
import { EnvironmentService } from 'src/app/services/environment.service'
import { SimpleDialogService } from 'src/app/services/simple-dialog.service'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

@Component({
  selector: 'app-pending-users',
  imports: [MatButtonModule, MatCardModule, LoaderComponent, TranslateModule],
  templateUrl: './pending-users.component.html',
  styleUrl: './pending-users.component.scss'
})
export class PendingUsersComponent {
  private adminService = inject(AdminService);
  private simpleDialog = inject(SimpleDialogService);
  private cdr = inject(ChangeDetectorRef)

  pendingUsers: SimplifiedUser[] = []
  loading = signal(true)

  constructor() {
    const simpleTitle = inject(SimpleTitleService);

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

  async reloadList() {
    this.pendingUsers = []
    await this.adminService.getPendingActivationUsers().then((response) => {
      this.pendingUsers = response.map((elem) => {
        elem.avatar = EnvironmentService.environment.baseMediaUrl + elem.avatar
        return elem
      })
    })
    this.loading.set(false)
    this.cdr.detectChanges()
  }
}
