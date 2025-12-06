import { Injectable, inject } from '@angular/core'
import { confetti, ConfettiOptions } from '@tsparticles/confetti'
import { RecursivePartial } from '@tsparticles/engine'
import { SettingsService } from './settings.service'

@Injectable({
  providedIn: 'root'
})
export class ParticleService {
  private settings = inject(SettingsService);


  private confetti(opts: {
    location?: { event?: MouseEvent; scroll?: { x: number; y: number } }
    config?: RecursivePartial<ConfettiOptions>
  }) {
    if (this.settings.values().disableConfetti === true) return

    const defaultConfig: ConfettiOptions = {
      zIndex: 1000,
      scalar: 8,
      flat: (this.settings.values().flatConfetti as boolean | undefined) ?? false
    }

    // Attempt to place the confetti on the clicked location
    if (opts?.location?.event !== undefined) {
      // If we don't get scroll data then use the current scroll (no modifier)
      opts.location.scroll = opts.location.scroll ?? { x: window.scrollX, y: window.scrollY }

      // Locational confetti
      const updatedX = opts.location.scroll.x - window.scrollX + opts.location.event.x
      const updatedY = opts.location.scroll.y - window.scrollY + opts.location.event.y

      const normalizedX = updatedX / window.innerWidth
      const normalizedY = updatedY / window.innerHeight

      // Ensure we're on screen and play locational OR just do the generic
      if (updatedX >= 0 && updatedY >= 0) {
        const confettiConfig = Object.assign(
          defaultConfig,
          {
            particleCount: Math.floor(10 * Number(this.settings.values().confettiMultiplier ?? 1)),
            spread: 360,
            startVelocity: 20,
            origin: {
              x: normalizedX,
              y: normalizedY
            }
          },
          opts.config
        )
        confetti(confettiConfig)
        return
      }
    }

    // No location = generic confetti
    const conf = Object.assign(
      defaultConfig,
      {
        particleCount: Math.floor(10 * Number(this.settings.values().confettiMultiplier ?? 1)),
        spread: 60,
        startVelocity: 60
      },
      opts.config
    )
    confetti({
      angle: 45,
      origin: {
        x: 0,
        y: 0.8
      },
      ...conf
    })
    confetti({
      angle: 180 - 45,
      origin: {
        x: 1,
        y: 0.8
      },
      ...conf
    })
  }

  like(event?: MouseEvent, scroll?: { x: number; y: number }) {
    this.confetti({
      location: { event, scroll },
      config: {
        shapes: ['hearts'],
        colors: ['#d2849c', '#70b07d', '#73a1dc'],
        scalar: 8
      }
    })
  }

  emojiReact(emoji: string[] | string, event?: MouseEvent, scroll?: { x: number; y: number }) {
    if (!Array.isArray(emoji)) {
      emoji = [emoji]
    }

    this.confetti({
      location: { event, scroll },
      config: {
        shapes: ['emoji'],
        shapeOptions: {
          emoji: {
            value: [...emoji],
            font: 'sans-serif'
          }
        },
        scalar: 4
      }
    })
  }
  imageReact(image: string, event?: MouseEvent, scroll?: { x: number; y: number }) {
    this.confetti({
      location: { event, scroll },
      config: {
        shapes: ['image'],
        shapeOptions: {
          image: [{ src: image, width: 32, height: 32 }]
        },
        scalar: 5
      }
    })
  }

  genericConfetti() {
    this.confetti({
      config: {
        shapes: ['star'],
        colors: ['#d2849c', '#70b07d', '#73a1dc'],
        scalar: 2
      }
    })
  }
}
