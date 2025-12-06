import { Component, OnInit, ViewChild } from '@angular/core'
import { server } from 'src/app/interfaces/servers'
import { AdminService, InviteCode } from 'src/app/services/admin.service'
import { MatTableDataSource } from '@angular/material/table'
import { MatPaginator } from '@angular/material/paginator'
import { SimpleTitleService } from 'src/app/services/simple-title.service'
import { MatDialog } from '@angular/material/dialog'
import { EnvironmentService } from 'src/app/services/environment.service'

@Component({
  selector: 'app-invite-codes',
  templateUrl: './invite-codes.component.html',
  styleUrls: ['./invite-codes.component.scss'],
  standalone: false
})
export class InviteCodesComponent implements OnInit {
  ready = false
  originalInvites: InviteCode[] = []

  displayedColumns = ['actions', 'code', 'createdBy', 'usedBy', 'expiresIn']
  @ViewChild(MatPaginator) paginator!: MatPaginator

  dataSource!: MatTableDataSource<InviteCode, MatPaginator>

  constructor(
    private adminService: AdminService,
    simpleTitle: SimpleTitleService,
    public dialogService: MatDialog
  ) {
    simpleTitle.set('menu.admin.inviteCodes')

    this.adminService.getInviteCodes().then((response) => {
      this.originalInvites = JSON.parse(JSON.stringify(response))
      this.ready = true
      this.dataSource.data = response
    })
  }

  ngOnInit(): void {
    this.dataSource = new MatTableDataSource<InviteCode, MatPaginator>([])
    setTimeout(() => {
      this.dataSource.paginator = this.paginator
    })
  }

  async addInviteCodeComponent(): Promise<typeof AddInviteCodeComponent> {
    const { AddInviteCodeComponent } = await import('../../../components/add-invite-code/add-invite-code.component')
    return AddInviteCodeComponent
  }

  async createInvite() {
    this.dialogService.open(await this.addInviteCodeComponent(), {
      width: '800px'
    })
  }

  async copy(code: string, method: 'CODE' | 'LINK' = 'CODE') {
    navigator.clipboard.writeText(
      method === 'CODE' ? code :
        (new URL(`/register?code=${code}`, EnvironmentService.environment.frontUrl).href)
    )
  }
}
