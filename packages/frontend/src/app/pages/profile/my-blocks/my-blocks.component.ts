import { DatePipe } from '@angular/common'
import { Component, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatSortModule } from '@angular/material/sort'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { RouterModule } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { AvatarSmallComponent } from 'src/app/components/avatar-small/avatar-small.component'
import { BlogLinkModule } from 'src/app/directives/blog-link/blog-link.module'
import { UserBlockMute } from 'src/app/services/admin.service'
import { BlocksService } from 'src/app/services/blocks.service'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

@Component({
  selector: 'app-my-blocks',
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
    DatePipe,
    BlogLinkModule
  ],
  templateUrl: './my-blocks.component.html',
  styleUrls: ['./my-blocks.component.scss']
})
export class MyBlocksComponent {
  private blocksService = inject(BlocksService)

  blocks = new MatTableDataSource<UserBlockMute | null, MatPaginator>(undefined)

  displayedColumns = ['user', 'reason', 'date', 'actions']

  loading = true

  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.settings.myBlockedUsers')
  }

  async ngOnInit() {
    const res = await this.blocksService.getBlockList()
    this.blocks.data = res
    this.blocks.filterPredicate = (block, filter) =>
      block?.url?.startsWith(filter) || block?.reason?.startsWith(filter) || false

    this.loading = false
  }

  async unblockUser(id: string) {
    const newBlocks = await this.blocksService.promptUnblockUser(id)
    this.loading = true
    if (newBlocks) {
      this.blocks.data = newBlocks
    }
    this.loading = false
  }

  onInput(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.blocks.filter = target.value
    }
  }
}
