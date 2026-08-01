import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { NotificationsComponent } from './notifications.component'
import { Route, RouterModule } from '@angular/router'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { MatButtonModule } from '@angular/material/button'
import { LoaderComponent } from '../../components/loader/loader.component'
import { SingleNotificationComponent } from '../../components/single-notification/single-notification.component'
import { loginRequiredGuard } from '../../guards/login-required.guard'

const routes: Route[] = [
  {
    path: '',
    component: NotificationsComponent,
    canActivate: [loginRequiredGuard]
  },
  {
    path: 'detached',
    component: NotificationsComponent,
    canActivate: [loginRequiredGuard]
  }
]
@NgModule({
  declarations: [NotificationsComponent],
  imports: [
    CommonModule,
    TranslateModule,
    SingleNotificationComponent,
    RouterModule.forChild(routes),
    FontAwesomeModule,
    MatButtonModule,
    LoaderComponent
  ]
})
export class NotificationsModule {}
