import { DatePipe } from '@angular/common'
import { Component, viewChild, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatSort, MatSortModule } from '@angular/material/sort'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { RouterModule } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { AvatarSmallComponent } from 'src/app/components/avatar-small/avatar-small.component'
import { AdminService, AdminUserBlocks, ServerBlock, AdminUserBlock } from 'src/app/services/admin.service'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

@Component({
  selector: 'app-blocks',
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
    TranslatePipe,
    DatePipe
  ],
  templateUrl: './blocks.component.html',
  styleUrls: ['./blocks.component.scss']
})
export class BlocksComponent {
  private adminService = inject(AdminService);

  showUserBlocks = false
  userBlocks = new MatTableDataSource<AdminUserBlock, MatPaginator>(undefined)
  userBlocksPaginator = viewChild.required<MatPaginator>('userBlocksPaginator')
  userBlocksSort = viewChild.required<MatSort>('userBlocksSort')
  userBlocksColumns = ['blocker', 'blocked', 'reason', 'createdAt']

  showUserServerBlocks = false
  userServerBlocks = new MatTableDataSource<ServerBlock, MatPaginator>(undefined)
  userServerBlocksPaginator = viewChild.required<MatPaginator>('userServerBlocksPaginator')
  userServerBlocksSort = viewChild.required<MatSort>('userServerBlocksSort')
  userServerBlocksColumns = ['userBlocker', 'blockedServer', 'createdAt']

  constructor() {
    const simpleTitle = inject(SimpleTitleService);

    simpleTitle.set('menu.admin.blocklist')
  }

  async ngOnInit() {
    const res: AdminUserBlocks = await this.adminService.getBlocks()

    this.userBlocks.data = res.userBlocks
    this.userBlocks.filterPredicate = (block, filter) =>
      block.blocker.url.startsWith(filter) || block.blocked.url.startsWith(filter)
    this.userBlocks.sort = this.userBlocksSort()
    this.userBlocks.sortingDataAccessor = (block, header) => {
      switch (header) {
        case 'blocker':
          return block.blocker.url
        case 'blocked':
          return block.blocked.url
        case 'createdAt':
          return block.createdAt
        default:
          return ''
      }
    }
    this.userBlocks.paginator = this.userBlocksPaginator()

    this.userServerBlocks.data = res.userServerBlocks
    this.userServerBlocks.paginator = this.userServerBlocksPaginator()
    this.userServerBlocks.filterPredicate = (block, filter) =>
      block.userBlocker.url.startsWith(filter) || block.blockedServer.displayName.startsWith(filter)
    this.userServerBlocks.sort = this.userServerBlocksSort()
    this.userServerBlocks.sortingDataAccessor = (block, header) => {
      switch (header) {
        case 'userBlocker':
          return block.userBlocker.url
        case 'blockedServer':
          return block.blockedServer.displayName
        case 'createdAt':
          return block.createdAt
        default:
          return ''
      }
    }
  }

  onUserBlockChange(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.userBlocks.filter = target.value
    }
  }

  onUserServerBlockChange(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.userServerBlocks.filter = target.value
    }
  }
}
