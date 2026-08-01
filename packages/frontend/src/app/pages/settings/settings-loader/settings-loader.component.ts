import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { SETTINGS_TOKEN } from '../settings.component'
import { RouterModule } from '@angular/router'
import { CdkPortalOutlet, Portal } from '@angular/cdk/portal'
import { MatButtonModule } from '@angular/material/button'
import { SettingEntryComponent } from '../../../components/setting-entry/setting-entry.component'
import { SettingData, GroupedSettingData, SettingsService } from '../../../services/settings.service'

@Component({
  selector: 'app-setting-loader',
  imports: [TranslateModule, SettingEntryComponent, RouterModule, CdkPortalOutlet, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './settings-loader.component.html'
})
export class SettingsLoaderComponent {
  data: SettingData
  values
  group: GroupedSettingData | undefined
  portal: Portal<any> | undefined

  constructor() {
    const settingsService = inject(SettingsService)
    const groupKey = inject(SETTINGS_TOKEN)

    this.data = settingsService.data
    this.values = settingsService.values
    this.group = settingsService.groups.find((val) => val.key === groupKey)
  }
}
