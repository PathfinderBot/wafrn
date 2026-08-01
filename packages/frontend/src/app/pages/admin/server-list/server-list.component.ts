import { Component, OnInit, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatTableDataSource } from '@angular/material/table'
import { MatPaginator } from '@angular/material/paginator'
import { server } from '../../../interfaces/servers'
import { AdminService } from '../../../services/admin.service'
import { SimpleTitleService } from '../../../services/simple-title.service'

@Component({
  selector: 'app-server-list',
  templateUrl: './server-list.component.html',
  styleUrls: ['./server-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ServerListComponent implements OnInit {
  private adminService = inject(AdminService)

  ready = false
  originalServers: server[] = []

  displayedColumns = ['displayName', 'blocked', 'bubbleTimeline', 'friendServer', 'detail']
  @ViewChild(MatPaginator) paginator!: MatPaginator

  dataSource!: MatTableDataSource<server, MatPaginator>

  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.admin.serverList')

    this.adminService.getServers().then((response) => {
      this.originalServers = JSON.parse(JSON.stringify(response))
      this.ready = true
      this.dataSource.data = response
    })
  }
  ngOnInit(): void {
    this.dataSource = new MatTableDataSource<server, MatPaginator>([])
    setTimeout(() => {
      this.dataSource.paginator = this.paginator
    })
  }

  async save() {
    // we detect where we have made changes the shotgun way
    const serversToPatch: server[] = []
    this.dataSource.data.forEach((elem, index) => {
      const original = this.originalServers[index]
      if (
        elem.blocked != original.blocked ||
        elem.detail != original.detail ||
        elem.friendServer != original.friendServer ||
        elem.bubbleTimeline != original.bubbleTimeline
      ) {
        serversToPatch.push(elem)
      }
    })
    await this.adminService.updateServers(serversToPatch)
    this.originalServers = JSON.parse(JSON.stringify(this.dataSource.data))
  }
}
