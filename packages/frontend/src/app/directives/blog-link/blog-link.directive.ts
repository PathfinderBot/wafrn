import { Directive, ElementRef, HostListener, Input, OnChanges, Renderer2, inject } from '@angular/core'
import { SnappyInjectable } from '../../components/snappy/snappy-router.component'
import { SnappyService } from '../../components/snappy/snappy.service'
import { SimplifiedUser } from '../../interfaces/simplified-user'

@Directive({
  selector: '[blogLink]'
})
export class BlogLinkDirective implements OnChanges {
  private readonly host = inject(ElementRef)
  private readonly renderer = inject(Renderer2)
  private readonly snappy = inject(SnappyService)

  @Input({ required: true }) blogLink?: SimplifiedUser | null

  ngOnChanges() {
    if (!this.blogLink) return
    this.renderer.setAttribute(this.host.nativeElement, 'href', '/blog/' + this.blogLink.url)
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (!this.blogLink) return
    if (!event.ctrlKey && event.button === 0) {
      event.preventDefault()
      const wrapper = new SnappyBlogData(this.blogLink)
      this.snappy.navigateTo('/blog/' + this.blogLink.url, wrapper)
    }
  }
}

@SnappyInjectable
export class SnappyBlogData {
  public blog: SimplifiedUser

  constructor(blog: SimplifiedUser) {
    this.blog = blog
  }
}
