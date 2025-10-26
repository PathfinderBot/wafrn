import { CdkPortalOutlet, ComponentPortal, Portal } from '@angular/cdk/portal'
import { Component, InjectionToken, Injector, Signal } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { ActivatedRoute, RouterModule } from '@angular/router'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons'
import { TranslateModule } from '@ngx-translate/core'
import { GroupedSettingData, SettingData, SettingsService, SettingValues } from 'src/app/services/settings.service'
import { SettingsLoaderComponent } from './settings-loader/settings-loader.component'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

export const SETTINGS_TOKEN = new InjectionToken('settings token')

@Component({
  selector: 'app-settings',
  imports: [
    MatListModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FontAwesomeModule,
    RouterModule,
    TranslateModule,
    CdkPortalOutlet
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  data: SettingData
  values
  groups: GroupedSettingData[]

  // Portal related
  portal: Portal<any> | undefined

  // Service signal mirrors
  settingsModified: Signal<boolean>
  settingsLoading: Signal<boolean>

  // Icons
  saveIcon = faFloppyDisk

  constructor(
    private settingsService: SettingsService,
    activatedRoute: ActivatedRoute,
    simpleTitle: SimpleTitleService
  ) {
    this.data = settingsService.data
    this.values = settingsService.values
    this.groups = settingsService.groups
    this.settingsModified = settingsService.settingsModified
    this.settingsLoading = settingsService.settingsLoading

    activatedRoute.url.subscribe((data) => {
      const groupKey = data[0]?.path
      const groupEntry =
        groupKey === undefined
          ? settingsService.groups.find((val) => val.default === true) // If there is no matching key, find a default page
          : settingsService.groups.find((val) => val.key === groupKey)

      const entryIsComponent = groupEntry && groupEntry.type === 'component' && groupEntry.component
      if (entryIsComponent) {
        this.portal = new ComponentPortal(<any>groupEntry.component)
      } else {
        const injector = Injector.create({ providers: [{ provide: SETTINGS_TOKEN, useValue: groupKey }] })
        this.portal = new ComponentPortal(SettingsLoaderComponent, null, injector)
      }
    })

    simpleTitle.set('menu.settings.title')
  }

  saveSettings() {
    this.settingsService.saveSettings()
  }
}
