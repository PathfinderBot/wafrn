import 'jest-preset-angular/setup-env/zone'
import { getTestBed } from '@angular/core/testing'
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing'
import { TranslateModule } from '@ngx-translate/core'

// Mock AudioContext for testing
Object.defineProperty(window, 'AudioContext', {
  value: class AudioContext {
    createBuffer() {}
    decodeAudioData() {}
  },
  writable: true,
  configurable: true
})

// Mock fetch if not available
if (typeof window !== 'undefined' && !window.fetch) {
  window.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
    })
  ) as any
}

// Mock vlitejs module
jest.mock('vlitejs', () => ({
  default: class Vlitejs {
    constructor() {}
  }
}), { virtual: true })

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  {
    teardown: { destroyAfterEach: true }
  }
)

// Add default imports for all tests
const testBed = getTestBed()
const originalConfigureTestingModule = testBed.configureTestingModule.bind(testBed)

testBed.configureTestingModule = function(config: any) {
  const imports = (config.imports || [])
  if (!imports.some((imp: any) => imp === TranslateModule || (imp.ɵmod && imp.ɵmod.type.name === 'TranslateModule'))) {
    config.imports = [...imports, TranslateModule.forRoot()]
  }
  return originalConfigureTestingModule(config)
}
