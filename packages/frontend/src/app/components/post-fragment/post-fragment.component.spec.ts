import { ComponentFixture, TestBed } from '@angular/core/testing'

import { PostFragmentComponent } from './post-fragment.component'
import { LoginService } from '../../services/login.service'
import { EnvironmentService } from '../../services/environment.service'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { WafrnMediaComponent } from '../wafrn-media/wafrn-media.component'
import { MockComponent, MockModule } from 'ng-mocks'
import { signal } from '@angular/core'
import { ProcessedPost } from '../../interfaces/processed-post'
import { SimplifiedUser } from '../../interfaces/simplified-user'
import { InteractionControl } from '../../interfaces/interaction-control'
import { BehaviorSubject } from 'rxjs'

describe('PostFragmentComponent', () => {
  let component: PostFragmentComponent
  let fixture: ComponentFixture<PostFragmentComponent>

  const mockUser: SimplifiedUser = {
    avatar: '',
    url: '',
    name: 'testUser',
    id: '1'
  }

  const createMockProcessedPost = (): ProcessedPost => ({
    ask: undefined,
    createdAt: new Date(),
    descendents: [],
    emojiReactions: [],
    emojis: [],
    medias: [],
    mentionPost: [],
    notes: 0,
    parentId: '',
    privacy: 0,
    questionPoll: undefined,
    quotes: [],
    parentCollection: [],
    remotePostId: '',
    tags: [],
    title: '',
    updatedAt: new Date(),
    user: mockUser,
    userId: '',
    userLikesPostRelations: [],
    markdownContent: '',
    isReblog: false,
    hierarchyLevel: 0,
    bookmarkers: [],
    canReply: true,
    featured: false,
    canQuote: true,
    canLike: true,
    canReblog: true,
    replyControl: InteractionControl.Anyone,
    reblogControl: InteractionControl.Anyone,
    quoteControl: InteractionControl.Anyone,
    likeControl: InteractionControl.Anyone,
    id: '1',
    content: 'No medias attached and ![media-1] string',
    content_warning: ''
  })

  beforeAll(() => {
    // Set the static environment property for EnvironmentService
    EnvironmentService.environment = {
      frontUrl: 'http://localhost'
    }
  })

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostFragmentComponent],
      providers: [
        provideHttpClientTesting(),
        {
          provide: LoginService,
          useValue: {
            getLoggedUserUUID: () => '',
            loggedIn: new BehaviorSubject(false),
            userPrefersReducedMotion: () => false
          }
        }
      ]
    }).compileComponents()

    fixture = TestBed.createComponent(PostFragmentComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput('fragment', createMockProcessedPost())
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })

  it('should process fragment blocks appropiately', () => {
    // Initial test with simple content
    const testPost = createMockProcessedPost()
    testPost.content = 'No medias attached and ![media-1] string'
    fixture.componentRef.setInput('fragment', testPost)
    fixture.detectChanges()
    expect(JSON.stringify(component.wafrnFormattedContent())).toBe(
      JSON.stringify(['No medias attached and ![media-1] string'])
    )

    // Second part of test with one media
    const testPostWithMedia = createMockProcessedPost()
    testPostWithMedia.content = 'post with one media ![media-1] and a second line'
    testPostWithMedia.medias = [
      {
        id: '1',
        NSFW: false,
        description: '',
        url: '',
        external: false,
        mediaOrder: 0
      },
      {
        id: '2',
        NSFW: false,
        description: '',
        url: '',
        external: false,
        mediaOrder: 0
      }
    ]
    fixture.componentRef.setInput('fragment', testPostWithMedia)
    fixture.detectChanges()
    expect(JSON.stringify(component.wafrnFormattedContent())).toBe(
      JSON.stringify([
        'post with one media ',
        {
          id: '1',
          NSFW: false,
          description: '',
          url: '',
          external: false,
          mediaOrder: 0
        },
        ' and a second line'
      ])
    )

    // Third part with two medias
    const testPostWithTwoMedias = createMockProcessedPost()
    testPostWithTwoMedias.content = 'start ![media-1] middle ![media-2] end'
    testPostWithTwoMedias.medias = [
      {
        id: '1',
        NSFW: false,
        description: '',
        url: '',
        external: false,
        mediaOrder: 0
      },
      {
        id: '2',
        NSFW: false,
        description: '',
        url: '',
        external: false,
        mediaOrder: 0
      }
    ]
    fixture.componentRef.setInput('fragment', testPostWithTwoMedias)
    fixture.detectChanges()
    expect(JSON.stringify(component.wafrnFormattedContent())).toBe(
      JSON.stringify([
        'start ',
        {
          id: '1',
          NSFW: false,
          description: '',
          url: '',
          external: false,
          mediaOrder: 0
        },
        ' middle ',
        {
          id: '2',
          NSFW: false,
          description: '',
          url: '',
          external: false,
          mediaOrder: 0
        },
        ' end'
      ])
    )

    // Last part with non-existent media
    const testPostWithNonExistentMedia = createMockProcessedPost()
    testPostWithNonExistentMedia.content = 'start ![media-249] end'
    testPostWithNonExistentMedia.medias = [
      {
        id: '1',
        NSFW: false,
        description: '',
        url: '',
        external: false,
        mediaOrder: 0
      }
    ]
    fixture.componentRef.setInput('fragment', testPostWithNonExistentMedia)
    fixture.detectChanges()
    // acceptable compromise without more headaches. Your fault for making it like this lol
    expect(JSON.stringify(component.wafrnFormattedContent())).toBe(JSON.stringify(['start ', '![media-249]', ' end']))
  })
})
