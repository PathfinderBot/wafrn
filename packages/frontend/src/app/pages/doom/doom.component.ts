import { Component, ElementRef, viewChild, inject, ChangeDetectionStrategy } from '@angular/core'
import { SimpleTitleService } from '../../services/simple-title.service'

@Component({
  selector: 'app-doom',
  templateUrl: './doom.component.html',
  styleUrls: ['./doom.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class DoomComponent {
  doomFrame = viewChild<ElementRef<HTMLIFrameElement>>('doom')

  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('the social network with DOOM!')
  }

  snOnHide() {
    // Destroy the DOOM player when navigating away
    this.doomFrame()?.nativeElement.remove()
  }
}
