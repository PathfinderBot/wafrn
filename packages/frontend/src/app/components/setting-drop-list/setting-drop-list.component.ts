import { Component, Inject } from '@angular/core'
import { SETTINGS_TOKEN } from 'src/app/pages/settings/settings.component'
import {
  DropListData,
  DropListDataEntry,
  SettingData,
  SettingKey,
  SettingListItem,
  SettingsService
} from 'src/app/services/settings.service'
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop'
import { TranslatePipe } from '@ngx-translate/core'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faBars, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatButtonModule } from '@angular/material/button'
import { MatExpansionModule } from '@angular/material/expansion'

@Component({
  selector: 'app-setting-drop-list',
  templateUrl: './setting-drop-list.component.html',
  imports: [
    MatExpansionModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    MatCheckboxModule,
    MatButtonModule,
    FontAwesomeModule,
    TranslatePipe
  ],
  styleUrl: './setting-drop-list.component.scss'
})
export class SettingDropListComponent {
  data: SettingData
  settingKey: SettingKey
  itemList: SettingListItem[]
  defaultOrder: SettingListItem[]
  dropListDataEntry: DropListData | undefined // The active entry from the data above

  barsIcon = faBars
  defaultIcon = faRotateRight

  constructor(
    private settingsService: SettingsService,
    @Inject(SETTINGS_TOKEN) data: { settingKey: SettingKey }
  ) {
    this.data = settingsService.data
    this.settingKey = data.settingKey
    this.dropListDataEntry = this.data[this.settingKey].dropListData

    this.defaultOrder = this.data[this.settingKey].default as SettingListItem[]
    this.itemList = settingsService.values()[this.settingKey] as SettingListItem[]

    // Reset if no value or new values
    if (this.itemList.length === 0 || this.itemList.length !== this.defaultOrder.length) {
      this.resetList()
    }
  }

  dropItem(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.itemList, event.previousIndex, event.currentIndex)
    this.syncList()
  }
  toggleItem(index: number) {
    this.itemList[index].enabled = !this.itemList[index].enabled
    this.syncList()
  }

  resetList() {
    // Deep check (agony)
    const listDiffers = this.itemList.some(
      (item, index) =>
        item.enabled !== this.defaultOrder[index].enabled || item.value !== this.defaultOrder[index].value
    )
    if (listDiffers) {
      this.itemList = JSON.parse(JSON.stringify(this.defaultOrder))
      this.syncList()
      this.settingsService.settingsModified.set(true)
    }
  }

  syncList() {
    this.itemList = [...this.itemList] // update DOM hack
    this.settingsService.values()[this.settingKey] = this.itemList
    this.settingsService.values.update((v) => v)
    this.settingsService.settingsModified.set(true)
  }

  keyToEntry(key: string): DropListDataEntry | undefined {
    return this.dropListDataEntry && this.dropListDataEntry[key]
  }

  listAsString(list: SettingListItem[]): string {
    return list.map((item) => `${item.value}: ${item.enabled ? 'true' : 'false'}`).join(', ')
  }
}
