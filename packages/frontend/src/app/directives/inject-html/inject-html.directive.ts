import { Directive, ElementRef, Input, inject } from '@angular/core'
import { WafrnMedia } from 'src/app/interfaces/wafrn-media'

@Directive({
  selector: '[injectHTML]',
  standalone: false
})
export class InjectHTMLDirective {
  private host = inject(ElementRef);

  @Input() set injectHTML(content: string | WafrnMedia) {
    if (typeof content == 'string') {
      this.host.nativeElement.innerHTML = content
    }
  }
}
