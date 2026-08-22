import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WorkplaceType } from '@prisma/client';
import { UpdateProfileDto } from './update-profile.dto';

function instantiate(payload: Record<string, unknown>): UpdateProfileDto {
  return plainToInstance(UpdateProfileDto, payload);
}

async function propertiesInError(
  payload: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(instantiate(payload));
  return errors.map((e) => e.property);
}

describe('UpdateProfileDto', () => {
  it('accepts a fully populated profile', async () => {
    await expect(
      propertiesInError({
        displayName: 'Jane Doe',
        yearsOfExperience: 1,
        desiredRoles: ['Java Developer'],
        technologies: ['java'],
        locations: ['Berlin'],
        countryCodes: ['DE'],
        workplaceTypes: [WorkplaceType.REMOTE, WorkplaceType.HYBRID],
      }),
    ).resolves.toEqual([]);
  });

  it('accepts an empty body — every field is optional', async () => {
    await expect(propertiesInError({})).resolves.toEqual([]);
  });

  // docs/DATABASE.md §6: canonical values are normalized at write time.
  it('slugifies technologies to lowercase hyphenated form', () => {
    const dto = instantiate({ technologies: ['  Spring Boot ', 'JAVA'] });

    expect(dto.technologies).toEqual(['spring-boot', 'java']);
  });

  it('uppercases country codes', () => {
    const dto = instantiate({ countryCodes: [' de ', 'at'] });

    expect(dto.countryCodes).toEqual(['DE', 'AT']);
  });

  it('drops duplicates that collapse to the same canonical value', () => {
    const dto = instantiate({ technologies: ['Java', 'java', ' JAVA '] });

    expect(dto.technologies).toEqual(['java']);
  });

  it('drops entries that normalize to empty rather than storing blanks', () => {
    const dto = instantiate({ locations: ['Berlin', '   ', ''] });

    expect(dto.locations).toEqual(['Berlin']);
  });

  it('collapses internal whitespace in free-text entries', () => {
    const dto = instantiate({ locations: ['  Berlin,    Germany '] });

    expect(dto.locations).toEqual(['Berlin, Germany']);
  });

  it('rejects a country code that is not ISO-3166 alpha-2', async () => {
    await expect(
      propertiesInError({ countryCodes: ['ZZ'] }),
    ).resolves.toContain('countryCodes');
    await expect(
      propertiesInError({ countryCodes: ['GER'] }),
    ).resolves.toContain('countryCodes');
  });

  it('rejects an unknown workplace type', async () => {
    await expect(
      propertiesInError({ workplaceTypes: ['ANYWHERE'] }),
    ).resolves.toContain('workplaceTypes');
  });

  // The bound mirrors the Profile_years_range CHECK constraint; validating looser
  // than the database would turn a 400 into a 500.
  it('rejects yearsOfExperience outside the range the database allows', async () => {
    await expect(
      propertiesInError({ yearsOfExperience: -1 }),
    ).resolves.toContain('yearsOfExperience');
    await expect(
      propertiesInError({ yearsOfExperience: 61 }),
    ).resolves.toContain('yearsOfExperience');
    await expect(
      propertiesInError({ yearsOfExperience: 1.5 }),
    ).resolves.toContain('yearsOfExperience');
  });

  it('accepts both ends of the allowed experience range', async () => {
    await expect(propertiesInError({ yearsOfExperience: 0 })).resolves.toEqual(
      [],
    );
    await expect(propertiesInError({ yearsOfExperience: 60 })).resolves.toEqual(
      [],
    );
  });

  it('rejects a list longer than the cap', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `role-${i}`);

    await expect(
      propertiesInError({ desiredRoles: tooMany }),
    ).resolves.toContain('desiredRoles');
  });

  it('rejects an over-long entry inside a list', async () => {
    await expect(
      propertiesInError({ desiredRoles: ['x'.repeat(101)] }),
    ).resolves.toContain('desiredRoles');
  });

  it('rejects a non-array where a list is expected', async () => {
    await expect(
      propertiesInError({ technologies: 'java' }),
    ).resolves.toContain('technologies');
  });

  it('rejects a non-string entry inside a list', async () => {
    await expect(propertiesInError({ locations: [42] })).resolves.toContain(
      'locations',
    );
  });

  it('rejects a blank displayName', async () => {
    await expect(propertiesInError({ displayName: '   ' })).resolves.toContain(
      'displayName',
    );
  });
});
