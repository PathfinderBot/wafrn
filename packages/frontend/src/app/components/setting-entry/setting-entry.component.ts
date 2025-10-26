import { Component, computed, input, viewChildren } from '@angular/core'
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox'
import { MatInputModule } from '@angular/material/input'
import { MatSelectChange, MatSelectModule } from '@angular/material/select'
import { TranslateModule } from '@ngx-translate/core'
import { KeyValueTypedPipe } from 'src/app/pipes/keyvaluetyped.pipe'
import { SettingData, SettingDataEntry, SettingKey, SettingsService } from 'src/app/services/settings.service'
import { UserSelectorComponent } from '../user-selector/user-selector.component'

@Component({
  selector: 'app-setting-entry',
  imports: [
    TranslateModule,
    MatCheckboxModule,
    MatSelectModule,
    MatInputModule,
    KeyValueTypedPipe,
    UserSelectorComponent
  ],
  templateUrl: './setting-entry.component.html',
  styleUrl: './setting-entry.component.scss'
})
export class SettingEntryComponent {
  data: SettingData
  values
  setting = input.required<SettingDataEntry>()

  matFormFieldElements = viewChildren('formSelect')

  hasDependency = computed(() => this.setting().enableIfSetting !== undefined)
  isDisabled = computed(() => {
    this.settingsService.settingsModified()
    const enablefunc = this.setting().enableIfSetting
    if (enablefunc) {
      return !enablefunc(this.values())
    } else {
      return false
    }
  })

  constructor(private settingsService: SettingsService) {
    this.data = settingsService.data
    this.values = settingsService.values
  }

  updateCheckbox(key: SettingKey, event: MatCheckboxChange) {
    this.values()[key] = event.checked
    this.values.update((v) => v)
    this.settingsService.settingsModified.set(true)
  }

  updateSelect(key: SettingKey, event: MatSelectChange) {
    this.values()[key] = event.value
    this.values.update((v) => v)
    this.settingsService.settingsModified.set(true)
  }

  updateInput(key: SettingKey, event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.values()[key] = target.value
      this.values.update((v) => v)
      this.settingsService.settingsModified.set(true)
    }
  }

  updateUserInput(event: { remoteId: string; url: string }) {
    this.values()[this.setting().key] = event.remoteId
    this.values.update((v) => v)
    this.settingsService.settingsModified.set(true)
  }
}
