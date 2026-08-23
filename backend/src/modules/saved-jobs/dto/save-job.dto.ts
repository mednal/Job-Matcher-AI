import { IsUUID } from 'class-validator';

/**
 * The body of `POST /saved-jobs` (`docs/ARCHITECTURE.md` §8).
 *
 * `jobId` is the only field, and deliberately so. `SavedJob.note` exists in the
 * schema (`docs/DATABASE.md` §3.5) but no MVP flow surfaces it, and accepting it
 * here would force an idempotency rule nothing in the product asks for — whether
 * a second save overwrites the first note, or silently keeps it. M10.1 saves a
 * job; it does not annotate one.
 *
 * There is no `userId`: the owner is the authenticated caller, and a body field
 * naming a user is exactly how one account reaches another's rows.
 */
export class SaveJobDto {
  @IsUUID()
  jobId!: string;
}
