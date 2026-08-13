import { Directive, ElementRef, Input, inject } from '@angular/core'
import { WafrnMedia } from '../../interfaces/wafrn-media'

@Directive({
  selector: '[injectHTML]'
})
export class InjectHTMLDirective {
  private host = inject(ElementRef)

  @Input() set injectHTML(content: string | WafrnMedia) {
    if (typeof content == 'string') {
      this.host.nativeElement.innerHTML = content
    }
  }
}
