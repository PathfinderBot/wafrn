import { Injectable } from '@angular/core'

const audioNameVariants = [
  'like',
  'sendWoot',
  // no use for 3.ogg yet
  'notification',
  'follow'
] as const
type AudioNameTuple = typeof audioNameVariants
export type AudioName = AudioNameTuple[number]
export type AudioData = {
  [key in AudioName]: string
}

export const audioMap: AudioData = {
  like: '/assets/sounds/1.ogg',
  sendWoot: '/assets/sounds/2.ogg',
  // no use for 3.ogg yet
  notification: '/assets/sounds/4.ogg',
  follow: '/assets/sounds/5.ogg'
}

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  audios: Map<string, AudioBuffer> = new Map()

  constructor() {
    // TODO maybe a better way to say "hey preload these audios"
    const audiosToPreload = [
      '/assets/sounds/1.ogg',
      '/assets/sounds/2.ogg',
      '/assets/sounds/3.ogg',
      '/assets/sounds/4.ogg',
      '/assets/sounds/5.ogg'
    ]

    audiosToPreload.forEach(async (elem) => {
      const audio = await fetch(elem)
      const audioBuf = await audio.arrayBuffer()
      this.audios.set(elem, await this.audioContext.decodeAudioData(audioBuf))
    })
  }

  async playSound(name: AudioName, volume = 0.3) {
    const source = this.audioContext.createBufferSource();
    const soundFile = audioMap[name]
    try {
      let audio = this.audios.get(soundFile)
      if (!audio) {
        const audioFile = await fetch(soundFile)
        const audioBuf = await audioFile.arrayBuffer()
        audio = await this.audioContext.decodeAudioData(audioBuf)
      }
      source.buffer = audio
      const gainNode = this.audioContext.createGain();
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      source.start(0);
    } catch (error) {
      console.error(error)
    }
  }
}
