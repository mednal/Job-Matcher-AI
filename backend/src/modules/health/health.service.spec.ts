import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  it('reports an ok status', () => {
    expect(service.check()).toEqual({ status: 'ok' });
  });
});
