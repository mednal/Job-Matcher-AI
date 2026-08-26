import { TestBed } from '@angular/core/testing';
import { Pagination } from './pagination';

function render(inputs: { page: number; pageSize: number; total: number; busy?: boolean }) {
  const fixture = TestBed.createComponent(Pagination);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(element.querySelectorAll('button'));
  const button = (label: string) => buttons().find((node) => node.textContent?.trim() === label)!;

  return {
    element,
    text: () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    previous: () => button('Previous'),
    next: () => button('Next'),
    click(label: string) {
      button(label).click();
      fixture.detectChanges();
    },
  };
}

describe('Pagination', () => {
  it('says which results are on screen and out of how many', () => {
    expect(render({ page: 3, pageSize: 20, total: 137 }).text()).toContain('Showing 41–60 of 137');
  });

  it('does not claim a full page on the last one', () => {
    expect(render({ page: 7, pageSize: 20, total: 137 }).text()).toContain(
      'Showing 121–137 of 137',
    );
  });

  it('counts from zero when nothing matched', () => {
    expect(render({ page: 1, pageSize: 20, total: 0 }).text()).toContain('Showing 0–0 of 0');
  });

  it('names the page out of the number of pages', () => {
    expect(render({ page: 3, pageSize: 20, total: 137 }).text()).toContain('page 3 of 7');
  });

  it('offers no previous page on the first one', () => {
    expect(render({ page: 1, pageSize: 20, total: 137 }).previous().disabled).toBe(true);
  });

  it('offers no next page on the last one', () => {
    expect(render({ page: 7, pageSize: 20, total: 137 }).next().disabled).toBe(true);
  });

  /**
   * The API caps `page` at 200, so a deeper result set has to stop being pageable
   * rather than offering a button that answers with a 400.
   */
  it('stops at the last page the API will serve', () => {
    const paging = render({ page: 200, pageSize: 20, total: 100_000 });

    expect(paging.text()).toContain('page 200 of 200');
    expect(paging.next().disabled).toBe(true);
  });

  it('asks for the next page by number', () => {
    const fixture = TestBed.createComponent(Pagination);
    fixture.componentRef.setInput('page', 3);
    fixture.componentRef.setInput('pageSize', 20);
    fixture.componentRef.setInput('total', 137);
    const asked: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => asked.push(page));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(element.querySelectorAll('button'));
    buttons.find((node) => node.textContent?.trim() === 'Next')!.click();
    buttons.find((node) => node.textContent?.trim() === 'Previous')!.click();

    expect(asked).toEqual([4, 2]);
  });

  it('cannot be paged while a search is in flight', () => {
    const paging = render({ page: 3, pageSize: 20, total: 137, busy: true });

    expect(paging.next().disabled).toBe(true);
    expect(paging.previous().disabled).toBe(true);
  });
});
