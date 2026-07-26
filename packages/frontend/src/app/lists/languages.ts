// This is the file where we get language data for the app
//
// To add a language after making the JSON file, add it to supportedLanguages
// below here as the name of your JSON file without the extension. Then add its
// data to languageMap below. Use the native version of a language
export const supportedLanguages = [
  'en',
  'de',
  'es',
  'fr',
  'ga',
  'gl',
  'hu',
  'nl',
  'pl',
  'br',
  'ru',
  'sr-Cyrl',
  'sr-Latn',
  'tok',
  'uk',
  'fi',
  'se',
  'qpv'
] as const
type SupportedLanguagesTuple = typeof supportedLanguages
export type SupportedLanguage = SupportedLanguagesTuple[number]

export type LanguageData = { name: string }
export const languageMap: Record<SupportedLanguage, LanguageData> = {
  en: { name: 'English' },
  de: { name: 'Deutsch' },
  es: { name: 'Español' },
  fr: { name: 'Français' },
  ga: { name: 'Gaeilge' },
  gl: { name: 'Galego' },
  hu: { name: 'Magyar' },
  nl: { name: 'Nederlands' },
  pl: { name: 'Polski' },
  br: { name: 'Português Brasileiro' },
  ru: { name: 'Русский язык' },
  'sr-Cyrl': { name: 'Српски' },
  'sr-Latn': { name: 'Srpski' },
  tok: { name: 'toki pona' },
  uk: { name: 'Українська' },
  qpv: { name: 'Viossa' },
  fi: { name: 'Suomi' },
  se: { name: 'Svenska' }
}
