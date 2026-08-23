import { Test } from '@nestjs/testing';
import { ClassificationModule } from './classification.module';
import { ExperienceExtractionService } from './experience-extraction.service';

describe('ExperienceExtractionService', () => {
  let service: ExperienceExtractionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClassificationModule],
    }).compile();

    service = moduleRef.get(ExperienceExtractionService);
  });

  it('resolves from the module', () => {
    expect(service).toBeInstanceOf(ExperienceExtractionService);
  });

  it('extracts the stated requirement with its verbatim evidence', () => {
    const result = service.extract(
      'Requirements: at least 5 years of professional experience with Java.',
    );

    expect(result).toMatchObject({ minYears: 5, maxYears: null });
    expect(result.mentions[0].text).toBe(
      'at least 5 years of professional experience',
    );
  });

  it('reports no requirement when the posting states no figure', () => {
    expect(service.extract('We hire for potential, not for a CV.')).toEqual({
      minYears: null,
      maxYears: null,
      mentions: [],
    });
  });
});
