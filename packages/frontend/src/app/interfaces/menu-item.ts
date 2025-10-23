import { IconDefinition } from '@fortawesome/free-solid-svg-icons'

export interface MenuItem {
  label: string
  labelDynamic?: () => string
  icon?: IconDefinition
  image?: string
  visible: () => boolean
  badge?: () => number
  items?: MenuItem[]
  routerLink?: string
  routerLinkDynamic?: () => string
  highlightRoute?: boolean
  url?: string
  command?: () => void
  divider?: boolean
  plainText?: boolean
  class?: string
  active?: boolean
}

export interface MenuLink {
  label: string
  routerLink?: string
  url?: string
}
