import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterModule } from '@angular/router'
import { loginRequiredGuard } from '../../guards/login-required.guard'

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    RouterModule.forChild([
      {
        path: 'migrate-out',
        loadComponent: () =>
          import('../../components/migrate-out/migrate-out.component').then((c) => c.MigrateOutComponent)
      },
      {
        path: 'edit',
        loadComponent: () => import('./edit-profile/edit-profile.component').then((m) => m.EditProfileComponent),
        canActivate: [loginRequiredGuard]
      },
      {
        path: 'css',
        loadComponent: () => import('./css-editor/css-editor.component').then((m) => m.CssEditorComponent)
      },
      {
        path: 'blocks',
        loadComponent: () => import('./my-blocks/my-blocks.component').then((c) => c.MyBlocksComponent)
      },
      {
        path: 'serverBlocks',
        loadComponent: () =>
          import('./my-server-blocks/my-server-blocks.component').then((m) => m.MyServerBlocksComponent)
      },
      {
        path: 'mutes',
        loadComponent: () => import('./my-mutes/my-mutes.component').then((c) => c.MyMutesComponent)
      },
      {
        path: 'silencedPosts',
        loadComponent: () => import('../../pages/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'bookmarkedPosts',
        loadComponent: () => import('../../pages/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'myDrafts',
        loadComponent: () => import('../../pages/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'importFollows',
        loadComponent: () =>
          import('./import-followers/import-followers.component').then((m) => m.ImportFollowersComponent)
      },
      {
        path: 'myAsks',
        loadComponent: () => import('../ask-list/ask-list.component').then((c) => c.AskListComponent)
      },
      {
        path: 'enable-bluesky',
        loadComponent: () =>
          import('../../pages/enable-bluesky/enable-bluesky.component').then((c) => c.EnableBlueskyComponent)
      },
      {
        path: 'migrate-bluesky',
        loadComponent: () =>
          import('../../pages/migrate-bluesky/migrate-bluesky.component').then((c) => c.MigrateBlueskyComponent)
      },
      {
        path: 'manageFollowedHashtags',
        loadComponent: () =>
          import('../../pages/manage-followed-hashtags/manage-followed-hashtags.component').then(
            (c) => c.ManageFollowedHashtagsComponent
          )
      }
    ])
  ]
})
export class ProfileModule {}
