import { getTestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { vi } from 'vitest'

// Mock AudioContext for testing
Object.defineProperty(window, 'AudioContext', {
  value: class AudioContext {
    createBuffer() {}
    decodeAudioData() {}
  },
  writable: true,
  configurable: true
})

// Always stub fetch so tests never hit the network (e.g. AudioService fetching sound assets)
window.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
  })
) as any

// Add default imports for all tests
const testBed = getTestBed()
const originalConfigureTestingModule = testBed.configureTestingModule.bind(testBed)

testBed.configureTestingModule = function (config: any) {
  const imports = config.imports || []
  if (!imports.some((imp: any) => imp === TranslateModule || (imp.ɵmod && imp.ɵmod.type.name === 'TranslateModule'))) {
    config.imports = [...imports, TranslateModule.forRoot()]
  }
  return originalConfigureTestingModule(config)
}
