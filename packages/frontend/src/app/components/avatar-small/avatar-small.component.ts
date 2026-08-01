import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { RouterModule } from '@angular/router'
import { SimplifiedUser } from '../../interfaces/simplified-user'
import { EnvironmentService } from '../../services/environment.service'
import { BlogLinkModule } from 'src/app/directives/blog-link/blog-link.module'
import { MatTooltipModule } from '@angular/material/tooltip'

@Component({
  selector: 'app-avatar-small',
  imports: [RouterModule, BlogLinkModule, MatTooltipModule],
  templateUrl: './avatar-small.component.html',
  styleUrl: './avatar-small.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AvatarSmallComponent {
  user = input<SimplifiedUser>()
  readonly disabled = input(false)
  avatar = computed(() => {
    const user = this.user()
    if (user === undefined) {
      return '/assets/img/anon.webp'
    }
    return (
      (EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : '') +
      '/api/v2/cache/avatar/' +
      user.id
    )
  })
}
