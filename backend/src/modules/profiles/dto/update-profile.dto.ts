import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO31661Alpha2,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WorkplaceType } from '@prisma/client';

// Every list is capped. These are search preferences, not a data store, and an
// uncapped string[] is a free write-amplification vector on a JWT-authenticated
// endpoint.
const MAX_LIST_LENGTH = 50;
const MAX_ENTRY_LENGTH = 100;

// docs/DATABASE.md §6: canonical vocabularies are normalized at *write* time,
// because comparing un-normalized values at read time silently matches nothing.
// `technologies` are lowercase slugs; `countryCodes` are uppercase alpha-2.
function normalizeEntries(
  value: unknown,
  normalize: (entry: string) => string,
): unknown {
  if (!Array.isArray(value)) {
    // Not an array — hand it to @IsArray unchanged so validation, not this
    // transform, produces the 400.
    return value;
  }
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'string') {
      result.push(entry);
      continue;
    }
    const normalized = normalize(entry);
    if (normalized.length === 0 || seen.has(normalized)) {
      // Duplicates are dropped rather than rejected: two spellings of one skill
      // collapse to the same slug, and that is a correction, not a client error.
      // Left in, they would double-count in M9.5's profile-fit ranking.
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

// Minimal slug form only: lowercase, trimmed, internal whitespace hyphenated.
// The skill *dictionary* that maps synonyms onto canonical slugs is Phase 6's
// (M6.3) and does not exist yet; this deliberately does not invent one.
function toSlug(entry: string): string {
  return entry.trim().toLowerCase().replace(/\s+/g, '-');
}

function collapseWhitespace(entry: string): string {
  return entry.trim().replace(/\s+/g, ' ');
}

// PUT is a full replacement, not a merge (docs/ARCHITECTURE.md §8 lists no PATCH
// for this resource). An omitted list is therefore cleared, which is the only way
// a client can empty one — a merge would make "remove my last technology"
// impossible to express.
export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? collapseWhitespace(value) : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ENTRY_LENGTH)
  displayName?: string;

  // Upper bound mirrors the Profile_years_range CHECK constraint in
  // docs/DATABASE.md §5. Validating looser than the database turns a 400 into a
  // 500.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  yearsOfExperience?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    normalizeEntries(value, collapseWhitespace),
  )
  @IsArray()
  @ArrayMaxSize(MAX_LIST_LENGTH)
  @IsString({ each: true })
  @MaxLength(MAX_ENTRY_LENGTH, { each: true })
  desiredRoles?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeEntries(value, toSlug))
  @IsArray()
  @ArrayMaxSize(MAX_LIST_LENGTH)
  @IsString({ each: true })
  @MaxLength(MAX_ENTRY_LENGTH, { each: true })
  technologies?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    normalizeEntries(value, collapseWhitespace),
  )
  @IsArray()
  @ArrayMaxSize(MAX_LIST_LENGTH)
  @IsString({ each: true })
  @MaxLength(MAX_ENTRY_LENGTH, { each: true })
  locations?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    normalizeEntries(value, (entry) => entry.trim().toUpperCase()),
  )
  @IsArray()
  @ArrayMaxSize(MAX_LIST_LENGTH)
  @IsISO31661Alpha2({ each: true })
  countryCodes?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    // Trim only — the case must survive for @IsEnum to match.
    normalizeEntries(value, (entry) => entry.trim()),
  )
  @IsArray()
  @ArrayMaxSize(MAX_LIST_LENGTH)
  @IsEnum(WorkplaceType, { each: true })
  workplaceTypes?: WorkplaceType[];
}
