import { Component, ElementRef, viewChild, inject } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

@Component({
  selector: 'app-doom',
  templateUrl: './doom.component.html',
  styleUrls: ['./doom.component.scss'],
  standalone: false
})
export class DoomComponent {
  doomFrame = viewChild<ElementRef<HTMLIFrameElement>>('doom')

  constructor() {
    const simpleTitle = inject(SimpleTitleService);

    simpleTitle.set('the social network with DOOM!')
  }

  snOnHide() {
    // Destroy the DOOM player when navigating away
    this.doomFrame()?.nativeElement.remove()
  }
}
