import { Test } from '@nestjs/testing';
import { LanguageDetectionService } from './language-detection.service';
import { NormalizationModule } from './normalization.module';

describe('LanguageDetectionService', () => {
  let service: LanguageDetectionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NormalizationModule],
    }).compile();

    service = moduleRef.get(LanguageDetectionService);
  });

  it('resolves from the module', () => {
    expect(service).toBeInstanceOf(LanguageDetectionService);
  });

  it('detects a language and never returns null', () => {
    expect(
      service.detect({
        description: 'Wir suchen einen Junior Entwickler für unser Team.',
      }),
    ).toBe('de');
    expect(service.detect({})).toBe('en');
  });

  it('names the search configuration a stored language was indexed with', () => {
    expect(service.searchConfiguration('de')).toBe('german');
    expect(service.searchConfiguration('en')).toBe('english');
  });
});
