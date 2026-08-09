import { TestBed } from '@angular/core/testing'
import { PostsService } from './posts.service'
import { EnvironmentService } from './environment.service'
import { ProcessedPost } from '../interfaces/processed-post'

describe('PostsService trailing hashtag stripping', () => {
  let service: PostsService

  beforeEach(() => {
    TestBed.configureTestingModule({})
    EnvironmentService.environment.frontUrl = 'https://wafrn.vercel.app'
    service = TestBed.inject(PostsService)
  })

  function basePost(content: string, tagNames: string[]): ProcessedPost {
    return {
      content,
      tags: tagNames.map((tagName) => ({ tagName })),
      emojis: [],
      medias: []
    } as unknown as ProcessedPost
  }

  it('strips a trailing block of hashtag links matching known tags, keeps mid-sentence text', () => {
    const content =
      '<p>what\'s the worst media purchase you\'ve ever made/regret making? (This can also include movie tickets, musicals, concerts, subscriptions, etc)</p>' +
      '<p><a href="/tags/QuestionOfTheDay" class="hashtag">#QuestionOfTheDay</a> <a href="/tags/books" class="hashtag">#books</a> <a href="/tags/musicals" class="hashtag">#musicals</a></p>'
    const tagNames = ['QuestionOfTheDay', 'books', 'boardgames', 'ttrpg', 'musicals']
    const html = service.getPostHtml(basePost(content, tagNames))
    expect(html).toContain('worst media purchase')
    expect(html).toContain('musicals, concerts') // mid-sentence mention untouched
    expect(html).not.toContain('#QuestionOfTheDay')
    expect(html).not.toContain('#books')
    expect(html).not.toContain('class="hashtag"')
  })

  it('leaves hashtag links untouched when they are not in the known tags list', () => {
    const content = '<p>check out <a href="/tags/unlisted" class="hashtag">#unlisted</a></p>'
    const html = service.getPostHtml(basePost(content, ['other']))
    expect(html).toContain('#unlisted')
  })

  it('does not strip a hashtag used mid-sentence followed by more text', () => {
    const content = '<p>I love <a href="/tags/cats" class="hashtag">#cats</a> so much, they are great</p>'
    const html = service.getPostHtml(basePost(content, ['cats']))
    expect(html).toContain('#cats')
    expect(html).toContain('so much')
  })
})
