import { ComponentFixture, TestBed } from '@angular/core/testing'

import { PostHtmlContentComponent } from './post-html-content.component'

describe('PostHtmlContentComponent', () => {
  let component: PostHtmlContentComponent
  let fixture: ComponentFixture<PostHtmlContentComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostHtmlContentComponent]
    }).compileComponents()

    fixture = TestBed.createComponent(PostHtmlContentComponent)
    component = fixture.componentInstance
  })

  it('should create', () => {
    fixture.componentRef.setInput('fragment', '<p>test content</p>')
    fixture.detectChanges()
    expect(component).toBeTruthy()
  })
})
