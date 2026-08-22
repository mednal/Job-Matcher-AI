import { Module } from '@nestjs/common';
import { SourceRegistryService } from './source-registry.service';
import { SOURCE_ADAPTERS } from './source-adapters.token';
import { SourceHttpClient } from './http/source-http-client';
import { FixtureSourceAdapter } from './adapters/fixture/fixture-source.adapter';

/**
 * Adding a source is one new directory under `adapters/` plus one entry in the
 * array below — nothing else in the application changes (§6.1).
 *
 * The fixture adapter is listed unconditionally, not behind a NODE_ENV check
 * (decision A6): it makes a production smoke test possible without touching a real
 * source. Its `JobSource.enabled` flag is what stops it running anywhere it should
 * not, and that lives in the database precisely so it needs no deploy.
 */
const ADAPTERS = [FixtureSourceAdapter];

@Module({
  providers: [
    SourceHttpClient,
    ...ADAPTERS,
    {
      provide: SOURCE_ADAPTERS,
      // Resolved through DI rather than constructed here, so adapters can inject
      // the shared HTTP client — the only path any of them has to the network.
      inject: ADAPTERS,
      useFactory: (...adapters: InstanceType<(typeof ADAPTERS)[number]>[]) =>
        adapters,
    },
    SourceRegistryService,
  ],
  // The types, the registry and the client leave this module; the concrete
  // adapters never do.
  exports: [SourceRegistryService, SourceHttpClient],
})
export class SourcesModule {}
