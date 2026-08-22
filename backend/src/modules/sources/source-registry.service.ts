import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  JobSourceAdapter,
  SourceDescriptor,
} from './source-adapter.types';
import {
  SOURCE_ADAPTERS,
  type SourceAdapterList,
} from './source-adapters.token';
import { validateSourceDescriptor } from './source-descriptor.validator';
import { SourceDescriptorError } from './source-errors';

/**
 * Resolves adapters by key and is the gate every descriptor passes through.
 *
 * Validation happens in the constructor, not in a lifecycle hook, so an invalid or
 * duplicated descriptor **aborts boot** (A2) rather than failing later on the first
 * ingestion run — by which time nobody is watching.
 */
@Injectable()
export class SourceRegistryService {
  private readonly logger = new Logger(SourceRegistryService.name);
  private readonly adapters = new Map<string, JobSourceAdapter>();

  constructor(@Inject(SOURCE_ADAPTERS) adapters: SourceAdapterList) {
    for (const adapter of adapters) {
      const descriptor = adapter?.descriptor;
      if (!descriptor) {
        throw new SourceDescriptorError(
          `${adapter?.constructor?.name ?? 'An adapter'} exposes no descriptor`,
        );
      }

      validateSourceDescriptor(descriptor);

      // Two adapters claiming one key would make `JobSource.key` ambiguous and
      // silently give one of them every other one's postings.
      const existing = this.adapters.get(descriptor.key);
      if (existing) {
        throw new SourceDescriptorError(
          `Duplicate source key "${descriptor.key}": registered by both ` +
            `${existing.constructor.name} and ${adapter.constructor.name}`,
        );
      }

      this.adapters.set(descriptor.key, adapter);
    }

    this.logger.log(
      `Registered ${this.adapters.size} source adapter(s): ${
        [...this.adapters.keys()].join(', ') || 'none'
      }`,
    );
  }

  /** Every registered adapter, in registration order. */
  all(): JobSourceAdapter[] {
    return [...this.adapters.values()];
  }

  keys(): string[] {
    return [...this.adapters.keys()];
  }

  has(key: string): boolean {
    return this.adapters.has(key);
  }

  /** Returns undefined for an unknown key; callers decide whether that is fatal. */
  find(key: string): JobSourceAdapter | undefined {
    return this.adapters.get(key);
  }

  /** Throws for an unknown key — for callers that cannot proceed without one. */
  require(key: string): JobSourceAdapter {
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new SourceDescriptorError(
        `No source adapter registered for key "${key}". Registered: ${
          this.keys().join(', ') || 'none'
        }`,
      );
    }
    return adapter;
  }

  descriptor(key: string): SourceDescriptor {
    return this.require(key).descriptor;
  }
}
