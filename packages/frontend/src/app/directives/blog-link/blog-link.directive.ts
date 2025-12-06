import { Directive, ElementRef, HostListener, Input, OnInit, Renderer2, inject } from '@angular/core';
import { SnappyInjectable } from 'src/app/components/snappy/snappy-router.component';
import { SnappyService } from 'src/app/components/snappy/snappy.service';
import { SimplifiedUser } from 'src/app/interfaces/simplified-user';

@Directive({
  selector: '[blogLink]',
  standalone: false
})
export class BlogLinkDirective implements OnInit {
  private readonly host = inject(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly snappy = inject(SnappyService);

  @Input({ required: true }) blogLink?: SimplifiedUser | null;

  async ngOnInit() {
    if (!this.blogLink) return;
    this.renderer.setAttribute(this.host.nativeElement, 'href', '/blog/' + this.blogLink.url)
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (!this.blogLink) return;
    if (!event.ctrlKey && event.button === 0) {
      event.preventDefault();
      const wrapper = new SnappyBlogData(this.blogLink);
      this.snappy.navigateTo('/blog/' + this.blogLink.url, wrapper);
    }
  }
}

@SnappyInjectable
export class SnappyBlogData {
  public blog: SimplifiedUser;

  constructor(blog: SimplifiedUser) {
    this.blog = blog;
  }
}
