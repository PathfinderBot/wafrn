import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Route, RouterModule } from '@angular/router'

const routes: Route[] = [
  {
    path: 'server-list',
    loadChildren: () => import('./server-list/server-list.module').then((m) => m.ServerListModule)
  },
  {
    path: 'invite-codes',
    loadChildren: () => import('./invite-codes/invite-codes.module').then((m) => m.InviteCodesModule)
  },
  {
    path: 'user-blocks',
    loadComponent: () => import('./blocks/blocks.component').then((c) => c.BlocksComponent)
  },
  {
    path: 'user-reports',
    loadChildren: () => import('./report-list/report-list.module').then((m) => m.ReportListModule)
  },
  {
    path: 'bans',
    loadComponent: () => import('./bans/bans.component').then((c) => c.BansComponent)
  },
  {
    path: 'activate-users',
    // new lazyloading method
    loadComponent: () => import('./pending-users/pending-users.component').then((m) => m.PendingUsersComponent)
  },
  {
    path: 'stats',
    // new lazyloading method
    loadComponent: () => import('./stats/stats.component').then((m) => m.StatsComponent)
  },
  {
    path: 'emojis',
    // new lazyloading method
    loadComponent: () => import('./emoji-uploader/emoji-uploader.component').then((m) => m.EmojiUploaderComponent)
  }
]
@NgModule({
  declarations: [],
  imports: [CommonModule, RouterModule.forChild(routes)]
})
export class AdminModule { }
