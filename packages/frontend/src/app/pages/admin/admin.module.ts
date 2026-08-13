import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Route, RouterModule } from '@angular/router'

const routes: Route[] = [
  {
    path: 'server-list',
    loadComponent: () => import('./server-list/server-list.component').then((m) => m.ServerListComponent)
  },
  {
    path: 'email-campaign',
    loadComponent: () => import('./email-campaign/email-campaign.component').then((m) => m.EmailCampaignComponent)
  },
  {
    path: 'invite-codes',
    loadComponent: () => import('./invite-codes/invite-codes.component').then((m) => m.InviteCodesComponent)
  },
  {
    path: 'user-blocks',
    loadComponent: () => import('./blocks/blocks.component').then((c) => c.BlocksComponent)
  },
  {
    path: 'user-reports',
    loadComponent: () => import('./report-list/report-list.component').then((m) => m.ReportListComponent)
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
export class AdminModule {}
