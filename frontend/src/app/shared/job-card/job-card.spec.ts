import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ClassificationSignal, JobSummary } from '../../core/models/job';
import { JobCard } from './job-card';

const JOB: JobSummary = {
  id: 'job-1',
  title: 'Junior Java Developer',
  companyName: 'Example Company',
  location: 'Berlin, Germany',
  countryCode: 'DE',
  workplaceType: 'HYBRID',
  employmentType: 'FULL_TIME',
  language: 'en',
  postedAt: null,
  effectivePostedAt: new Date().toISOString(),
  technologies: ['java', 'spring-boot'],
  juniorLevel: 'ENTRY_LEVEL',
  juniorScore: 94,
  requiredMinYears: 0,
  requiredMaxYears: 1,
  sourceCount: 1,
};

const SIGNALS: ClassificationSignal[] = [
  { code: 'ZERO_TO_ONE_YEARS', weight: 25, evidence: '0-1 years of experience' },
];

// Configured once per test rather than inside `render`, so a case may render the
// card twice — TestBed refuses to be configured after the first instantiation.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
});

function render(job: Partial<JobSummary> = {}, inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(JobCard);
  fixture.componentRef.setInput('job', { ...JOB, ...job });
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  return {
    element,
    text: () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    badgeScore: () => element.querySelector('.score-badge__score')?.textContent?.trim() ?? null,
    badgeBand: () => element.querySelector('.score-badge__band')?.textContent?.trim() ?? null,
    evidence: () =>
      Array.from(element.querySelectorAll('.signal-list__evidence'), (node) =>
        node.textContent?.trim(),
      ),
    // Read span by span rather than as `textContent`: Angular strips the
    // whitespace between two adjacent elements, so the label and its value would
    // otherwise come back glued together as "Experience0–1 years".
    facts: () =>
      Array.from(element.querySelectorAll('.job-card__facts li'), (node) =>
        Array.from(node.querySelectorAll('span'), (span) => span.textContent?.trim()).join(' '),
      ),
    chips: () =>
      Array.from(element.querySelectorAll('app-chip'), (node) => node.textContent?.trim()),
  };
}

describe('JobCard', () => {
  it('links the title to the job detail route', () => {
    const link = render().element.querySelector('a')!;

    expect(link.getAttribute('href')).toBe('/jobs/job-1');
    expect(link.textContent?.trim()).toBe('Junior Java Developer');
  });

  it('shows the company and where the job is', () => {
    expect(render().text()).toContain('Example Company');
    expect(render().text()).toContain('Berlin, Germany');
  });

  it('falls back to the country, then to saying nothing was stated', () => {
    expect(render({ location: null }).text()).toContain('DE');
    expect(render({ location: null, countryCode: null }).text()).toContain('Location not stated');
  });

  describe('the score and its evidence', () => {
    // The rule of §6.5, at the component that composes the two: this is the case
    // the search list actually hits, because `JobSummary` carries no signals.
    it('shows the band rather than the number when no signals are supplied', () => {
      const card = render();

      expect(card.badgeScore()).toBeNull();
      expect(card.badgeBand()).toBe('Entry level');
      expect(card.text()).not.toContain('94');
    });

    it('shows the number once the evidence is on the card with it', () => {
      const card = render({}, { positiveSignals: SIGNALS });

      expect(card.badgeScore()).toBe('94%');
      expect(card.evidence()).toEqual(['0-1 years of experience']);
    });

    it('withholds the number when every supplied signal lacks evidence', () => {
      const card = render(
        {},
        { positiveSignals: [{ code: 'TRAINING_PROVIDED', weight: 15, evidence: '' }] },
      );

      expect(card.badgeScore()).toBeNull();
      expect(card.evidence()).toEqual([]);
    });

    it('always carries the "Junior Match" label', () => {
      expect(render().text()).toContain('Junior Match');
    });
  });

  it('states the experience requirement, and says so when there is none', () => {
    expect(render().facts()).toContain('Experience 0–1 years');
    expect(render({ requiredMinYears: null, requiredMaxYears: null }).facts()).toContain(
      'Experience Not stated',
    );
  });

  it('renders the workplace and contract facts only when they are known', () => {
    expect(render().facts()).toContain('Workplace Hybrid');
    expect(render().facts()).toContain('Contract Full time');

    const bare = render({ workplaceType: null, employmentType: null }).facts();
    expect(bare.some((fact) => fact?.startsWith('Workplace'))).toBe(false);
    expect(bare.some((fact) => fact?.startsWith('Contract'))).toBe(false);
  });

  it('says "First seen" when the source never stated a posting date', () => {
    expect(render().facts()).toContain('First seen today');
  });

  it('says "Posted" when it has the source’s own date', () => {
    expect(render({ postedAt: new Date().toISOString() }).facts()).toContain('Posted today');
  });

  it('lists the technologies and summarizes the overflow', () => {
    const card = render({
      technologies: ['java', 'spring-boot', 'sql', 'docker', 'git', 'aws', 'kafka', 'redis'],
    });

    expect(card.chips()).toHaveLength(7);
    expect(card.chips()).toContain('+2 more');
  });

  it('reports a job carried by more than one source', () => {
    expect(render({ sourceCount: 3 }).text()).toContain('Also listed on 3 sources');
    expect(render({ sourceCount: 1 }).text()).not.toContain('Also listed on');
  });
});
