import { Component } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatInputModule } from '@angular/material/input'
import { MatSelectChange, MatSelectModule } from '@angular/material/select'
import { TranslateModule } from '@ngx-translate/core'
import { KeyValueTypedPipe } from 'src/app/pipes/keyvaluetyped.pipe'
import { ParticleService } from 'src/app/services/particle.service'
import { SettingData, SettingsService, SettingValues } from 'src/app/services/settings.service'
import { SettingEntryComponent } from '../setting-entry/setting-entry.component'

const confettiTypeVariants = ['like', 'rewoot', 'edit', 'bookmark'] as const
type ConfettiType = (typeof confettiTypeVariants)[number]

@Component({
  selector: 'app-setting-confetti',
  imports: [
    TranslateModule,
    MatExpansionModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    SettingEntryComponent,
    KeyValueTypedPipe
  ],
  templateUrl: './setting-confetti.component.html',
  styleUrl: './setting-confetti.component.scss'
})
export class SettingConfettiComponent {
  data: SettingData
  values: SettingValues

  confettiType: ConfettiType = 'like'
  confettiTypeData: Record<ConfettiType, string> = {
    // Not sure if this is bad translation practice but it reduces duplication??
    like: 'post-actions.likePost',
    rewoot: 'post-actions.rewootPost',
    edit: 'post-actions.editPost',
    bookmark: 'post-actions.bookmarkPost'
  }

  constructor(
    private settingsService: SettingsService,
    private particle: ParticleService
  ) {
    this.data = settingsService.data
    this.values = settingsService.values
  }

  updateMultiplider(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.values.confettiMultiplier = target.value
      this.settingsService.settingsModified.set(true)
    }
  }

  updateTypeSelect(event: MatSelectChange<ConfettiType>) {
    this.confettiType = event.value
  }

  showConfetti(event?: MouseEvent) {
    switch (this.confettiType) {
      case 'like':
        this.particle.like(event)
        break
      case 'rewoot':
        this.particle.emojiReact('🔁', event)
        break
      case 'edit':
        this.particle.emojiReact(['✏️', '🖍️', '✒️', '🖊️'], event)

        break
      case 'bookmark':
        this.particle.emojiReact('💾', event)
        break
    }
  }
}
