import { Test } from '@nestjs/testing';
import { CompanyLocationService } from './company-location.service';
import { NormalizationModule } from './normalization.module';

describe('CompanyLocationService', () => {
  let service: CompanyLocationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NormalizationModule],
    }).compile();

    service = moduleRef.get(CompanyLocationService);
  });

  it('resolves from the module', () => {
    expect(service).toBeInstanceOf(CompanyLocationService);
  });

  it('slugs a company name', () => {
    expect(service.toCompanySlug('Example GmbH')).toBe('example');
    expect(service.toCompanySlug(null)).toBe('');
  });

  it('parses a location', () => {
    expect(service.parseLocation('Berlin, Germany')).toEqual({
      location: 'Berlin',
      countryCode: 'DE',
    });
    expect(service.parseLocation(null)).toEqual({
      location: null,
      countryCode: null,
    });
  });

  describe('against the fixture source payloads', () => {
    // The values the fixture adapter serves, so M5.4 wires this stage to input it
    // has already been checked against.
    const cases: ReadonlyArray<
      readonly [string, string, string, string | null, string | null]
    > = [
      [
        'Nordwind Software GmbH',
        'Berlin, Germany',
        'nordwind-software',
        'Berlin',
        'DE',
      ],
      ['Helios Data Ltd', 'Dublin, Ireland', 'helios-data', 'Dublin', 'IE'],
      [
        'Vantage Systems AG',
        'Zurich, Switzerland',
        'vantage-systems',
        'Zurich',
        'CH',
      ],
      [
        'Alpenblick Technik GmbH',
        'Munich, Germany',
        'alpenblick-technik',
        'Munich',
        'DE',
      ],
    ];

    it.each(cases)(
      '%s in %s',
      (
        companyName,
        location,
        expectedSlug,
        expectedLocation,
        expectedCountry,
      ) => {
        expect(service.toCompanySlug(companyName)).toBe(expectedSlug);
        expect(service.parseLocation(location)).toEqual({
          location: expectedLocation,
          countryCode: expectedCountry,
        });
      },
    );
  });

  describe('against the seeded canonical values', () => {
    // prisma/seed-data.ts carries hand-written slugs. If this stage disagreed with
    // them, ingesting the same employer would create a second dedup partition
    // alongside the seeded one.
    const seeded: ReadonlyArray<readonly [string, string]> = [
      ['Aurelia Systems Ltd', 'aurelia-systems'],
      ['Nordlicht Software GmbH', 'nordlicht-software'],
      ['Brightwater Labs Ltd', 'brightwater-labs'],
      ['Kranich Digital AG', 'kranich-digital'],
      ['Halcyon Retail BV', 'halcyon-retail'],
      ['Vantage Payments Ltd', 'vantage-payments'],
      ['Stahlwerk Digital GmbH', 'stahlwerk-digital'],
      ['Cobalt Grid Ltd', 'cobalt-grid'],
    ];

    it.each(seeded)('%s slugs to %s', (companyName, expected) => {
      expect(service.toCompanySlug(companyName)).toBe(expected);
    });
  });
});
