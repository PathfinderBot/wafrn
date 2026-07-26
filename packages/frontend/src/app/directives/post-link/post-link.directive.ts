import { Directive, ElementRef, HostListener, Input, OnInit, Renderer2, inject } from '@angular/core'
import { SnappyInjectable } from 'src/app/components/snappy/snappy-router.component'
import { SnappyService } from 'src/app/components/snappy/snappy.service'
import { ProcessedPost } from 'src/app/interfaces/processed-post'

@Directive({
  selector: '[postLink]',
  standalone: false
})
export class PostLinkDirective implements OnInit {
  private readonly host = inject(ElementRef)
  private readonly renderer = inject(Renderer2)
  private readonly snappy = inject(SnappyService)

  @Input({ required: true }) postLink!: ProcessedPost
  @Input() postLinkId?: string

  async ngOnInit() {
    this.postLinkId ??= this.postLink.id
    this.renderer.setAttribute(this.host.nativeElement, 'href', '/fediverse/post/' + this.postLinkId)
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (!event.ctrlKey && event.button === 0) {
      event.preventDefault()
      const wrapper: any = this.postLink.parentCollection.length > 0 ? new SnappyPostData(this.postLink) : null
      this.snappy.navigateTo('/fediverse/post/' + this.postLinkId!, wrapper)
    }
  }
}

@SnappyInjectable
export class SnappyPostData {
  public post: ProcessedPost
  constructor(post: ProcessedPost) {
    this.post = post
  }
}
