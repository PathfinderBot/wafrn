import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatInputModule } from '@angular/material/input'
import { MatSelectChange, MatSelectModule } from '@angular/material/select'
import { TranslateModule } from '@ngx-translate/core'
import { SettingEntryComponent } from '../setting-entry/setting-entry.component'
import { KeyValueTypedPipe } from '../../pipes/keyvaluetyped.pipe'
import { ParticleService } from '../../services/particle.service'
import { SettingsService, SettingData } from '../../services/settings.service'

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
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setting-confetti.component.scss'
})
export class SettingConfettiComponent {
  private settingsService = inject(SettingsService)
  private particle = inject(ParticleService)

  data: SettingData
  values

  confettiType: ConfettiType = 'like'
  confettiTypeData: Record<ConfettiType, string> = {
    // Not sure if this is bad translation practice but it reduces duplication??
    like: 'post-actions.likePost',
    rewoot: 'post-actions.rewootPost',
    edit: 'post-actions.editPost',
    bookmark: 'post-actions.bookmarkPost'
  }

  constructor() {
    const settingsService = this.settingsService

    this.data = settingsService.data
    this.values = settingsService.values
  }

  updateMultiplier(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.values().confettiMultiplier = target.value
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
