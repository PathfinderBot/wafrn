import { DatePipe } from '@angular/common'
import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatSortModule } from '@angular/material/sort'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { RouterModule } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { AvatarSmallComponent } from '../../../components/avatar-small/avatar-small.component'
import { BlogLinkDirective } from '../../../directives/blog-link/blog-link.directive'
import { UserBlockMute } from '../../../services/admin.service'
import { BlocksService } from '../../../services/blocks.service'
import { SimpleTitleService } from '../../../services/simple-title.service'

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
    BlogLinkDirective
  ],
  templateUrl: './my-mutes.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
