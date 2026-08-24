import { Component, computed, input, output } from '@angular/core';
import { MAX_PAGE } from '../../../core/models/pagination';
import { Button } from '../../../shared/ui/button';

/**
 * Offset pagination over the `{ items, page, pageSize, total }` envelope every list
 * endpoint returns.
 *
 * Previous and next only. A numbered strip would have to decide how to elide a
 * hundred pages, and it answers a question nobody asks of a ranked result list —
 * page 47 of a relevance ordering means nothing, whereas "the next twenty" does.
 *
 * The buttons emit a page number rather than navigating: the page owns the URL, and
 * a component that wrote to the router would be a second author of the same state.
 */
@Component({
  selector: 'app-pagination',
  imports: [Button],
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly busy = input(false);

  readonly pageChange = output<number>();

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / Math.max(1, this.pageSize()))),
  );

  /**
   * The last page that can actually be asked for. The API caps `page` at
   * `MAX_PAGE`, so offering a link past it would be offering a 400 — a result set
   * that deep is a filter problem, not a paging one.
   */
  protected readonly lastPage = computed(() => Math.min(this.pageCount(), MAX_PAGE));

  protected readonly first = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );

  protected readonly last = computed(() => Math.min(this.page() * this.pageSize(), this.total()));

  protected readonly hasPrevious = computed(() => this.page() > 1);
  protected readonly hasNext = computed(() => this.page() < this.lastPage());

  protected previous(): void {
    if (this.hasPrevious()) {
      this.pageChange.emit(this.page() - 1);
    }
  }

  protected next(): void {
    if (this.hasNext()) {
      this.pageChange.emit(this.page() + 1);
    }
  }
}
