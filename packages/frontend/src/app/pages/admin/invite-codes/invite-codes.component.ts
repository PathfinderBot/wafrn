import { Component, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { MatDialog, MatDialogModule } from '@angular/material/dialog'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { MatCardModule } from '@angular/material/card'
import { MatInputModule } from '@angular/material/input'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatButtonModule } from '@angular/material/button'
import { TranslateModule } from '@ngx-translate/core'
import { InviteCode, AdminService } from '../../../services/admin.service'
import { EnvironmentService } from '../../../services/environment.service'
import { SimpleTitleService } from '../../../services/simple-title.service'

@Component({
  selector: 'app-invite-codes',
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatCardModule,
    MatPaginatorModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatDialogModule,
    TranslateModule
  ],
  templateUrl: './invite-codes.component.html',
  styleUrls: ['./invite-codes.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
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
      method === 'CODE' ? code : new URL(`/register?code=${code}`, EnvironmentService.environment.frontUrl).href
    )
  }
}
