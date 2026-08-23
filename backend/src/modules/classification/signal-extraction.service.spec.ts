import { Test } from '@nestjs/testing';
import { ClassificationModule } from './classification.module';
import { extractExperience } from './experience';
import { SignalExtractionService } from './signal-extraction.service';

describe('SignalExtractionService', () => {
  let service: SignalExtractionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClassificationModule],
    }).compile();

    service = moduleRef.get(SignalExtractionService);
  });

  it('is resolvable from the module, so M8.3 can inject it', () => {
    expect(service).toBeInstanceOf(SignalExtractionService);
  });

  it('returns both evidence lists for a posting that carries both', () => {
    const description =
      'This is an entry level position.\nYou will need 5+ years of professional experience.';

    const result = service.extract({
      description,
      experience: extractExperience(description),
    });

    expect(result.positive.map((signal) => signal.code)).toEqual([
      'ENTRY_LEVEL_STATED',
    ]);
    expect(result.negative.map((signal) => signal.code)).toEqual([
      'REQUIRES_5_PLUS_YEARS',
    ]);
  });

  it('returns two empty lists for a posting that states nothing', () => {
    expect(service.extract({ description: null })).toEqual({
      positive: [],
      negative: [],
    });
  });
});
