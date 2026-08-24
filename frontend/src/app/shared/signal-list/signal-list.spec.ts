import { TestBed } from '@angular/core/testing';
import { ClassificationSignal } from '../../core/models/job';
import { SignalList } from './signal-list';

function signal(
  code: string,
  weight: number,
  evidence = 'we welcome recent graduates',
): ClassificationSignal {
  return { code, weight, evidence };
}

function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(SignalList);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const groupText = (group: string) =>
    Array.from(
      element.querySelectorAll(`.signal-list__group--${group} .signal-list__item`),
      (node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

  return {
    element,
    headings: () =>
      Array.from(element.querySelectorAll('.signal-list__heading'), (node) =>
        node.textContent?.trim(),
      ),
    positive: () => groupText('positive'),
    negative: () => groupText('negative'),
    evidence: () =>
      Array.from(element.querySelectorAll('.signal-list__evidence'), (node) =>
        node.textContent?.trim(),
      ),
  };
}

describe('SignalList', () => {
  it('uses the product wording for both columns', () => {
    const list = render({
      positive: [signal('GRADUATES_WELCOME', 20)],
      negative: [signal('ON_CALL_EXPECTED', -10, 'participation in on-call rotation')],
    });

    expect(list.headings()).toEqual(['Positive signals', 'Potential concerns']);
  });

  it('renders the posting’s own words under each signal', () => {
    const list = render({
      positive: [signal('ZERO_TO_ONE_YEARS', 25, '0-1 years of professional experience')],
    });

    expect(list.positive()[0]).toContain('0–1 years of experience');
    expect(list.evidence()).toEqual(['0-1 years of professional experience']);
  });

  it('never renders a signal without its evidence', () => {
    const list = render({
      positive: [signal('TRAINING_PROVIDED', 15, '   '), signal('GRADUATES_WELCOME', 20)],
      negative: [signal('TEAM_LEAD', -25, '')],
    });

    expect(list.positive()).toHaveLength(1);
    expect(list.positive()[0]).toContain('Recent graduates welcome');
    expect(list.negative()).toEqual([]);
  });

  it('renders nothing at all when no signal can be shown with evidence', () => {
    const list = render({ positive: [signal('TRAINING_PROVIDED', 15, '')], negative: [] });

    expect(list.element.querySelector('.signal-list__columns')).toBeNull();
  });

  it('renders nothing when there are no signals', () => {
    expect(render().element.textContent?.trim()).toBe('');
  });

  it('omits a column that has no signals rather than showing an empty heading', () => {
    const list = render({ positive: [signal('GRADUATES_WELCOME', 20)] });

    expect(list.headings()).toEqual(['Positive signals']);
  });

  it('caps each column at the limit it is given', () => {
    const list = render({
      positive: [
        signal('GRADUATES_WELCOME', 20, 'graduates welcome'),
        signal('TRAINING_PROVIDED', 15, 'training provided'),
        signal('MENTORING_OFFERED', 15, 'you will be mentored'),
      ],
      limit: 2,
    });

    expect(list.positive()).toHaveLength(2);
  });

  it('shows a code it has no wording for rather than dropping the evidence', () => {
    const list = render({
      positive: [signal('SOME_FUTURE_SIGNAL', 5, 'no prior experience needed')],
    });

    expect(list.positive()[0]).toContain('Some future signal');
    expect(list.evidence()).toEqual(['no prior experience needed']);
  });
});
