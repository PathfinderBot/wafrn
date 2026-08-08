import {
  Component,
  Injector,
  OnInit,
  DOCUMENT,
  HostBinding,
  ElementRef,
  effect,
  inject,
  ChangeDetectionStrategy
} from '@angular/core'
import { SwUpdate } from '@angular/service-worker'
import { LoginService } from './services/login.service'
import { EnvironmentService } from './services/environment.service'
import { TranslateService } from '@ngx-translate/core'
import { SwPush } from '@angular/service-worker'
import { Title } from '@angular/platform-browser'
import { GlobalData } from './services/global-data.service'
import { WebsocketService } from './services/websocket.service'
import { NavigationError, Router, RouterOutlet } from '@angular/router'
import { filter, map } from 'rxjs'
import { MessageService } from './services/message.service'
import { supportedLanguages } from './lists/languages'
import { ThemeService } from './services/theme.service'
import { PostsService } from './services/posts.service'
import { HotkeyManagerComponent } from './components/hotkey-manager/hotkey-manager.component'
import { ThemeManagerComponent } from './components/theme-manager/theme-manager.component'

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HotkeyManagerComponent, ThemeManagerComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class AppComponent implements OnInit {
  private swUpdate = inject(SwUpdate)
  private swPush = inject(SwPush)
  private injector = inject(Injector)
  private loginService = inject(LoginService)
  private environmentService = inject(EnvironmentService)
  private document = inject<Document>(DOCUMENT)
  private translateService = inject(TranslateService)
  private websocketService = inject(WebsocketService)
  private router = inject(Router)
  private messages = inject(MessageService)
  private titleService = inject(Title)
  private postService = inject(PostsService)

  title = 'wafrn'

  @HostBinding('attr.data-additional-style-modes') dataAdditionalStyleModes: string | null = null

  constructor() {
    const swUpdate = this.swUpdate
    const translateService = this.translateService
    const router = this.router
    const themeService = inject(ThemeService)

    this.title = this.titleService.getTitle()
    GlobalData.appDefaultTitle = this.title

    this.translateService.addLangs([...supportedLanguages])
    this.translateService.setDefaultLang('en')

    // User specified language
    const userLanguage = localStorage?.getItem('appLanguage')
    if (userLanguage !== null && translateService.langs.includes(userLanguage)) {
      // Given the above call to add languages is correct to what we have, this should always succeed
      translateService.use(userLanguage)
    }

    // Keep the 'lang' property up to date
    const currentLang = this.translateService.currentLang || this.translateService.getDefaultLang() || 'en'
    this.document.documentElement.lang = currentLang
    this.translateService.onLangChange.subscribe((event) => {
      this.document.documentElement.lang = event.lang
    })

    router.events
      .pipe(
        filter((evt) => evt instanceof NavigationError),
        map((evt) => evt as NavigationError)
      )
      .subscribe((evt) => {
        if (evt.error instanceof Error && evt.error.name == 'ChunkLoadError') {
          window.location.assign(evt.url)
        }
      })
    swUpdate.unrecoverable.subscribe((event) => {
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (const registration of registrations) {
          registration.unregister()
        }
        window.location.reload()
      })
    })

    // Sync data value of additional style modes to root
    effect(() => {
      const attributeValue = Object.entries(themeService.additionalStyleModes)
        .filter(([_, value]) => value())
        .map(([mode, _]) => mode)
        .join(' ')
      this.dataAdditionalStyleModes = attributeValue || null
    })
  }

  ngOnInit() {
    // lets check for evil websites. fuck them.
    const referer = document.referrer
    if (referer) {
      console.log(referer)
      try {
        let evilUrls = [
          '4chan.org',
          'p.4chan.org',
          '8chan.org',
          '8kun.top',
          'kiwifarms.st',
          'truthsocial.com',
          'poast.org',
          '13bells.com',
          '1611.social',
          '4aem.com',
          '5dollah.click',
          'adachi.party',
          'adtension.com',
          'annihilation.social',
          'anon-kenkai.com',
          'asbestos.cafe',
          'bae.st',
          'banepo.st',
          'bassam.social',
          'battlepenguin.video',
          'beefyboys.win',
          'boymoder.biz',
          'brainsoap.net',
          'breastmilk.club',
          'brighteon.social',
          'cachapa.cc',
          'cachapa.xyz',
          'caekis.love',
          'cawfee.club',
          'childlove.su',
          'clew.lol',
          'clubcyberia.co',
          'contrapointsfan.club',
          'cottoncandy.cafe',
          'crlf.ninja',
          'crucible.world',
          'cum.camp',
          'cum.salon',
          'cunnyborea.space',
          'decayable.ink',
          'dembased.xyz',
          'detroitriotcity.com',
          'djsumdog.com',
          'drinkanddrive.africa',
          'eientei.org',
          'eveningzoo.club',
          'fluf.club',
          'foxgirl.lol',
          'freak.university',
          'freeatlantis.com',
          'freespeechextremist.com',
          'froth.zone',
          'fsebugoutzone.org',
          'gameliberty.club',
          'gearlandia.haus',
          'genderheretics.xyz',
          'geofront.rocks',
          'gleasonator.com',
          'glee.li',
          'glindr.org',
          'goyim.social',
          'h5q.net',
          'haeder.net',
          'handholding.io',
          'harpy.faith',
          'hitchhiker.social',
          'iddqd.social',
          'kitsunemimi.club',
          'kiwifarms.cc',
          'kurosawa.moe',
          'kyaruc.moe',
          'leafposter.club',
          'liberdon.com',
          'ligma.pro',
          'loli.church',
          'lolicon.rocks',
          'lolison.network',
          'lolison.top',
          'lovingexpressions.net',
          'makemysarcophagus.com',
          'mastinator.com',
          'merovingian.club',
          'midwaytrades.com',
          'mirr0r.city',
          'morale.ch',
          'mouse.services',
          'mugicha.club',
          'narrativerry.xyz',
          'nationalist.social',
          'needs.vodka',
          'neenster.org',
          'nicecrew.digital',
          'nightshift.social',
          'nnia.space',
          'noagendasocial.com',
          'noagendatube.com',
          'noauthority.social',
          'nobodyhasthe.biz',
          'norwoodzero.net',
          'nyanide.com',
          'onionfarms.org',
          'parcero.casa',
          'pawlicker.com',
          'pawoo.net',
          'pedo.school',
          'peertube.se',
          'peervideo.club',
          'piazza.today',
          'pibvt.net',
          'pieville.net',
          'pisskey.io',
          'plagu.ee',
          'poa.st',
          'poast.org',
          'poast.tv',
          'poster.place',
          'prospeech.space',
          'quodverum.com',
          'r18.social',
          'rakket.app',
          'rapemeat.express',
          'rapemeat.solutions',
          'rayci.st',
          'rebelbase.site',
          'ryona.agency',
          'sad.cab',
          'schwartzwelt.xyz',
          'seal.cafe',
          'shaw.app',
          'shigusegubu.club',
          'shitpost.cloud',
          'shortstacksran.ch',
          'silliness.observer',
          'skinheads.eu',
          'skinheads.io',
          'skinheads.social',
          'skinheads.uk',
          'skippers-bin.com',
          'skyshanty.xyz',
          'slash.cl',
          'sleepy.cafe',
          'smuglo.li',
          'sneed.social',
          'sonichu.com',
          'spinster.xyz',
          'springbo.cc',
          'strelizia.net',
          'subs4social.xyz',
          'taihou.website',
          'tastingtraffic.net',
          'teci.world',
          'theblab.org',
          'thechimp.zone',
          'thenobody.club',
          'thepostearthdestination.com',
          'tkammer.de',
          'trumpislovetrumpis.life',
          'truthsocial.co.in',
          'tsundere.love',
          'usualsuspects.lol',
          'vampiremaid.cafe',
          'varishangout.net',
          'volk.love',
          'volk.network',
          'wolfgirl.bar',
          'xn--p1abe3d.xn--80asehdb',
          'yggdrasil.social',
          'youjo.love',
          'zhub.link',
          // spanish 4chan
          'forocoches.com',
          // finish kiwifarms
          'ylilauta.org',
          'hommaforum.org'
        ]
        const refererUrl = new URL(referer)
        if (evilUrls.includes(refererUrl.host)) {
          while (true) {
            let i = 0
            i++
          }
        }
      } catch (error) {
        // we dont care too much
      }
    }

    // unregister serviceworkers
    /*navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (const registration of registrations) {
        registration.unregister();
      }
    });*/
    const wafrnUpdated = localStorage.getItem('wafrnUpdated')
    if (wafrnUpdated == 'true') {
      localStorage.removeItem('wafrnUpdated')
      this.messages.add({ severity: 'success', summary: 'Wafrn has been updated!' })
    }
    if (this.swUpdate.isEnabled) {
      console.log('SOFTWARE UPDATES ACTIVE - This is a PWA')
      this.swUpdate.checkForUpdate().then((updateAvaiable) => {
        if (EnvironmentService.environment.disablePWA) {
          if ('caches' in window) {
            caches.keys().then(function (keyList) {
              return Promise.all(
                keyList.map(function (key) {
                  return caches.delete(key)
                })
              )
            })
          }
          if (window.navigator && navigator.serviceWorker) {
            navigator.serviceWorker.getRegistrations().then(function (registrations) {
              for (const registration of registrations) {
                registration.unregister()
              }
            })
          }
        }
        // we are no longer asking nicely
        if (updateAvaiable) {
          localStorage.setItem('wafrnUpdated', 'true')
          if (window.location.toString().toLowerCase().endsWith('/editor')) {
            if (confirm('There is an update available, would you like to update?')) {
              window.location.reload()
            } else {
              alert('Please reload manualy after writing the post!')
            }
          } else {
            window.location.reload()
          }
        }
      })
    }

    if (EnvironmentService.environment.disablePWA) {
      if ('caches' in window) {
        caches.keys().then(function (keyList) {
          return Promise.all(
            keyList.map(function (key) {
              return caches.delete(key)
            })
          )
        })
      }
      if (window.navigator && navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
          for (const registration of registrations) {
            registration.unregister()
          }
        })
      }
    }
    // TODO lets keep with this later
    /*
    if (this.swPush.isEnabled && EnvironmentService.environment.webpushPublicKey) {
      this.swPush
        .requestSubscription({
          serverPublicKey: EnvironmentService.environment.webpushPublicKey
        })
        .then((notificationSubscription) => {
          console.log(notificationSubscription)
        })
    }
    */

    this.postService.loadFollowers().then(() => {})
  }
}
