import { TestBed } from '@angular/core/testing';
import { JuniorScoreBadge } from './junior-score-badge';

/**
 * §6.5's two rules, checked at the component that owns them: the label is
 * "Junior Match", and the number only appears when its evidence does.
 */
function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(JuniorScoreBadge);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  return {
    element,
    text: () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    score: () => element.querySelector('.score-badge__score')?.textContent?.trim() ?? null,
    band: () => element.querySelector('.score-badge__band')?.textContent?.trim() ?? null,
  };
}

describe('JuniorScoreBadge', () => {
  it('labels the number "Junior Match"', () => {
    expect(render({ level: 'ENTRY_LEVEL', score: 94, evidenceShown: true }).text()).toContain(
      'Junior Match',
    );
  });

  it('never words the score as a hiring outcome', () => {
    const text = render({ level: 'ENTRY_LEVEL', score: 94, evidenceShown: true }).text();

    expect(text).not.toMatch(/probabilit|chance|likelihood|match rate/i);
  });

  describe('the score without its evidence', () => {
    it('is withheld, and the band is shown instead', () => {
      const badge = render({ level: 'ENTRY_LEVEL', score: 94 });

      expect(badge.score()).toBeNull();
      expect(badge.text()).not.toContain('94');
      expect(badge.band()).toBe('Entry level');
    });

    it('is withheld even when the caller passes an empty evidence assertion', () => {
      expect(render({ level: 'AMBIGUOUS', score: 60, evidenceShown: false }).score()).toBeNull();
    });
  });

  describe('the score with its evidence', () => {
    it('renders the number as a percentage alongside the band', () => {
      const badge = render({ level: 'ENTRY_LEVEL', score: 94, evidenceShown: true });

      expect(badge.score()).toBe('94%');
      expect(badge.band()).toBe('Entry level');
    });

    it('renders a zero score rather than treating it as absent', () => {
      expect(render({ level: 'CLEARLY_EXPERIENCED', score: 0, evidenceShown: true }).score()).toBe(
        '0%',
      );
    });
  });

  it('reads the score out of 100 to a screen reader, never as a percentage', () => {
    const badge = render({ level: 'LIKELY_ENTRY_LEVEL', score: 78, evidenceShown: true });

    expect(badge.element.getAttribute('aria-label')).toBe(
      'Junior Match: 78 out of 100, Likely entry level',
    );
  });

  it('says a job is not yet assessed rather than showing an empty badge', () => {
    const badge = render({ level: null, score: null });

    expect(badge.band()).toBe('Not yet assessed');
    expect(badge.score()).toBeNull();
  });

  it('withholds a score that arrived without a level to put it in context', () => {
    const badge = render({ level: null, score: 70, evidenceShown: true });

    expect(badge.band()).toBe('Not yet assessed');
    expect(badge.score()).toBeNull();
  });

  it.each([
    ['ENTRY_LEVEL', 'Entry level', 'score-badge--entry'],
    ['LIKELY_ENTRY_LEVEL', 'Likely entry level', 'score-badge--likely'],
    ['AMBIGUOUS', 'Unclear', 'score-badge--unclear'],
    ['EXPERIENCED', 'Experienced', 'score-badge--experienced'],
    ['CLEARLY_EXPERIENCED', 'Clearly experienced', 'score-badge--experienced'],
  ])('words and tones %s as "%s"', (level, label, className) => {
    const badge = render({ level });

    expect(badge.band()).toBe(label);
    expect(badge.element.classList).toContain(className);
  });
});
