import { Component, computed, Input, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatListModule } from '@angular/material/list'
import { Router, RouterModule } from '@angular/router'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { MatBadgeModule } from '@angular/material/badge'
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu'

import { TranslateModule } from '@ngx-translate/core'
import { MenuItem } from '../../interfaces/menu-item'

@Component({
  selector: 'app-menu-item',
  imports: [
    RouterModule,
    FontAwesomeModule,
    MatButtonModule,
    MatListModule,
    MatBadgeModule,
    MatMenuModule,
    TranslateModule
  ],
  templateUrl: './menu-item.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './menu-item.component.scss'
})
export class MenuItemComponent {
  private router = inject(Router)

  arrowIcon = faChevronDown

  @Input() item!: MenuItem
  @Input() button = false
  expanded = false

  parsedLink = computed(() => {
    if (this.item.routerLink) {
      return this.item.routerLink
    }
    if (this.item.routerLinkDynamic) {
      return this.item.routerLinkDynamic()
    }

    return null
  })

  routeChildActive() {
    if (this.item.highlightRoute === false) return false
    const childMatches =
      this.item.items?.some((menuItem) => {
        if (menuItem.routerLinkDynamic) {
          return this.router.url.endsWith(menuItem.routerLinkDynamic())
        }
        if (menuItem.routerLink) {
          return this.router.url.endsWith(menuItem.routerLink)
        }
        return false
      }) === true
    return childMatches
  }

  doCommand() {
    if (this.item.items && this.item.items.length > 0) {
      this.expanded = !this.expanded
    } else {
      if (this.item.url) {
        window.open(this.item.url, '_blank')
      }
      if (this.item.command) {
        this.item.command()
      }
    }
  }

  handleKey(event: KeyboardEvent, menuTrigger?: MatMenuTrigger) {
    if (event.key !== 'Enter') return

    // Run the associated event
    if (this.item.items) {
      this.expanded = !this.expanded
      menuTrigger?.openMenu()
    } else {
      this.doCommand()
    }
  }
  menuClose() {
    this.expanded = false
  }
}
