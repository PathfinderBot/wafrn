import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { MatCardModule } from '@angular/material/card'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { MatButtonModule } from '@angular/material/button'
import { TranslateModule } from '@ngx-translate/core'
import { BlocksService } from '../../../services/blocks.service'

@Component({
  selector: 'app-my-server-blocks',
  imports: [CommonModule, FormsModule, MatTableModule, MatCardModule, MatPaginatorModule, MatButtonModule, TranslateModule],
  templateUrl: './my-server-blocks.component.html',
  styleUrls: ['./my-server-blocks.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class MyServerBlocksComponent {
  private blocksService = inject(BlocksService)

  serverBlocks = new MatTableDataSource<any, MatPaginator>(undefined)
  ready = false
  displayedColumns = ['muted', 'actions']

  constructor() {
    this.blocksService.getMyServerBlockList().then((backendResponse) => {
      this.serverBlocks.data = backendResponse
      this.ready = true
    })
  }

  unblockServer(id: string) {
    this.ready = false
    this.blocksService.unblockServer(id).then((response) => {
      this.serverBlocks.data = response
      this.ready = true
    })
  }
}
