import { ComponentFixture, TestBed } from '@angular/core/testing'

import { EmailCampaignComponent } from './email-campaign.component'

describe('EmailCampaignComponent', () => {
  let component: EmailCampaignComponent
  let fixture: ComponentFixture<EmailCampaignComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmailCampaignComponent]
    }).compileComponents()

    fixture = TestBed.createComponent(EmailCampaignComponent)
    component = fixture.componentInstance
    await fixture.whenStable()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
