import { Component, computed, output, signal, ChangeDetectionStrategy } from '@angular/core'
import { MatInputModule } from '@angular/material/input'
import { TranslatePipe } from '@ngx-translate/core'

// Normal prompts should only be a short length
const possiblePrompts = [
  'This is a good idea.',
  'Show me this.',
  'I am not in public.',
  "Let's get silly with it.",
  "Surely it's not that bad.",
  'Yes, do as I say!',
  'I must not fear.',
  'Clueless to my fate.'
]

// Rare prompts can be significantly longer
const rarePrompts = [
  "This is a secret rare prompt. You don't see this very often!",
  "We're no strangers to content. You know the warning and so do I.",
  'Cowards open content warnings many times before their deaths.',
  'Fool me once, shame on me. Fool me twice, still shame on me!',
  'We allow female representing nipples. This post may contain some.'
]

@Component({
  selector: 'app-typing-game',
  imports: [MatInputModule, TranslatePipe],
  templateUrl: './typing-game.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './typing-game.component.scss'
})
export class TypingGameComponent {
  won = output()

  typed = signal<string>('')
  prompt: string

  letterValid = computed(() =>
    this.prompt.split('').map((letter, i) => (i < this.typed().length ? letter === this.typed().at(i) : undefined))
  )

  constructor() {
    // 1/100 for a rare prompt
    if (Math.floor(Math.random() * 100) + 1 < 100) {
      this.prompt = possiblePrompts[Math.floor(Math.random() * possiblePrompts.length)]
    } else {
      this.prompt = rarePrompts[Math.floor(Math.random() * rarePrompts.length)]
    }
  }

  checkWin() {
    if (this.typed() !== this.prompt) return

    this.won.emit()
  }

  handleInput(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.typed.set(target.value)
    }
    this.checkWin()
  }
}
