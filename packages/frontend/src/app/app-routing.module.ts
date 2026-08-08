import { NgModule } from '@angular/core'
import { PreloadAllModules, RouteReuseStrategy, RouterModule, Routes } from '@angular/router'
import { NavigationMenuComponent } from './components/navigation-menu/navigation-menu.component'
import { isAdminGuard } from './guards/is-admin.guard'
import { loginRequiredGuard } from './guards/login-required.guard'
import { CustomReuseStrategy, ReuseableRouteType } from './services/routing.service'
import { userLoggedGuard } from './guards/user-logged.guard'

const searchRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/search/search.component').then((m) => m.SearchComponent),
    data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
  },
  {
    path: ':term',
    loadComponent: () => import('./pages/search/search.component').then((m) => m.SearchComponent),
    data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
  }
]

const routes: Routes = [
  {
    path: '',
    component: NavigationMenuComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [userLoggedGuard],
        loadComponent: () =>
          import('./components/home-redirector/home-redirector.component').then((m) => m.HomeRedirectorComponent)
        //loadChildren: () =>
      },
      {
        path: 'register',
        loadComponent: () => import('./pages/register/register.component').then((m) => m.RegisterComponent)
      },
      {
        path: 'checkMail',
        loadComponent: () => import('./pages/check-email/check-email.component').then((m) => m.CheckEmailComponent)
      },
      {
        path: 'about',
        loadComponent: () => import('./pages/about/about.component').then((m) => m.AboutComponent),
        data: { title: 'system.about' }
      },
      {
        path: 'privacy',
        redirectTo: '/article/system.privacy-policy'
      },
      {
        path: 'recoverPassword',
        loadComponent: () =>
          import('./pages/recover-password/recover-password.component').then((m) => m.RecoverPasswordComponent)
      },
      {
        path: 'mfaSetup',
        loadComponent: () => import('./pages/mfa-setup/mfa-setup.component').then((m) => m.MfaSetupComponent)
      },
      {
        path: 'dashboard/search',
        children: searchRoutes
      },
      {
        path: 'dashboard/notifications',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./pages/notifications/notifications.component').then((m) => m.NotificationsComponent),
            canActivate: [loginRequiredGuard]
          },
          {
            path: 'detached',
            loadComponent: () =>
              import('./pages/notifications/notifications.component').then((m) => m.NotificationsComponent),
            canActivate: [loginRequiredGuard]
          }
        ]
      },
      {
        path: 'dashboard',
        data: { reuseRoute: false }, // We reuse the children, but not this route specifically.
        children: [
          {
            path: '',
            loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
            canActivate: [loginRequiredGuard],
            data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
          },
          {
            path: 'explore',
            loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
            canActivate: [loginRequiredGuard],
            data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
          },
          {
            path: 'exploreLocal',
            loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
            data: { reuseRoute: true, routeType: ReuseableRouteType.Feed }
          },
          {
            path: 'private',
            loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
            canActivate: [loginRequiredGuard]
          }
        ]
      },
      {
        path: 'activate/:email/:activationCode',
        loadComponent: () =>
          import('./pages/activate-account/activate-account.component').then((m) => m.ActivateAccountComponent)
      },
      {
        path: 'resetPassword/:email/:resetCode',
        loadComponent: () =>
          import('./pages/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent)
      },
      {
        path: 'post/:id',
        redirectTo: '/fediverse/post/:id'
      },
      {
        path: 'fediverse/post',
        loadChildren: () => import('./pages/single-post/single-post.module').then((m) => m.SinglePostModule)
      },
      {
        path: 'article',
        loadChildren: () => import('./pages/single-post/single-post.module').then((m) => m.SinglePostModule)
      },
      {
        path: 'blog',
        data: { reuseRoute: false }, // BUG ON THIS ONE. THIS ONE GOES INTO A LOOP
        children: [
          {
            path: ':url',
            loadComponent: () => import('./pages/view-blog/view-blog.component').then((m) => m.ViewBlogComponent),
            data: { reuseRoute: true }
          },
          {
            path: ':url/ask',
            loadComponent: () => import('./pages/view-blog/view-blog.component').then((m) => m.ViewBlogComponent)
          },
          {
            path: ':url/followers',
            loadComponent: () =>
              import('./pages/profile/follows/follows.component').then((m) => m.FollowsComponent)
          },
          {
            path: ':url/following',
            loadComponent: () =>
              import('./pages/profile/follows/follows.component').then((m) => m.FollowsComponent)
          }
        ]
      },
      {
        path: 'profile',
        loadChildren: () => import('./pages/profile/profile.module').then((m) => m.ProfileModule),
        canActivate: [loginRequiredGuard]
      },
      {
        path: 'settings',
        loadChildren: () => import('./pages/settings/settings.module').then((m) => m.SettingsModule),
        canActivate: [loginRequiredGuard]
      },
      {
        path: 'login',
        loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent)
      },
      {
        path: 'login/mfa',
        loadComponent: () => import('./pages/login-mfa/login-mfa.component').then((m) => m.LoginMfaComponent)
      },
      {
        path: 'admin',
        loadChildren: () => import('./pages/admin/admin.module').then((m) => m.AdminModule),
        canActivate: [isAdminGuard]
      },
      {
        path: 'doom',
        loadComponent: () => import('./pages/doom/doom.component').then((m) => m.DoomComponent)
      },
      {
        path: 'editor',
        canActivate: [loginRequiredGuard],
        loadComponent: () => import('./components/new-editor/new-editor.component').then((m) => m.NewEditorComponent)
      },
      {
        path: 'aac4alex',
        loadComponent: () => import('./pages/aac-for-alex/aac-for-alex.component').then((m) => m.AacForAlexComponent)
      },
      {
        path: 'authorize_interaction',
        children: searchRoutes
      },
      {
        path: '**',
        loadComponent: () => import('./pages/pagenotfound/pagenotfound.component').then((m) => m.PagenotfoundComponent)
      }
    ]
  }
]

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      // tried not using this but in some circumstances is slow
      preloadingStrategy: PreloadAllModules,
      anchorScrolling: 'enabled',
      scrollPositionRestoration: 'enabled'
    }),
    NavigationMenuComponent
  ],
  providers: [{ provide: RouteReuseStrategy, useClass: CustomReuseStrategy }],
  exports: [RouterModule]
})
export class AppRoutingModule {}
