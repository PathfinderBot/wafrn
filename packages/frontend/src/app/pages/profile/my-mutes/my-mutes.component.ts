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
  selector: 'app-my-mutes',
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
  templateUrl: './my-mutes.component.html',
  styleUrls: ['./my-mutes.component.scss']
})
export class MyMutesComponent {
  private blocksService = inject(BlocksService)

  mutes = new MatTableDataSource<UserBlockMute | null, MatPaginator>(undefined)

  displayedColumns = ['user', 'reason', 'date', 'actions']

  loading = true

  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.settings.myBlockedUsers')
  }

  async ngOnInit() {
    const res = await this.blocksService.getMuteList()
    console.log(res)
    this.mutes.data = res
    this.mutes.filterPredicate = (block, filter) =>
      block?.url?.startsWith(filter) || block?.reason?.startsWith(filter) || false

    this.loading = false
  }

  async unmuteUser(id: string) {
    const newBlocks = await this.blocksService.promptUnmuteUser(id)
    this.loading = true
    if (newBlocks) {
      this.mutes.data = newBlocks
    }
  }

  onInput(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.mutes.filter = target.value
    }
  }
}
