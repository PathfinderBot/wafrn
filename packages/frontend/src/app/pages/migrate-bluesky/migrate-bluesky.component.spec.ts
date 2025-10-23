import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MigrateBlueskyComponent } from './migrate-bluesky.component';

describe('MigrateBlueskyComponent', () => {
  let component: MigrateBlueskyComponent;
  let fixture: ComponentFixture<MigrateBlueskyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MigrateBlueskyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MigrateBlueskyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
