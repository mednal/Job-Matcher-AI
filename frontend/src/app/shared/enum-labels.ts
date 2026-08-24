import { EmploymentType, WorkplaceType } from '../core/models/enums';

/**
 * Display wording for the API's closed vocabularies.
 *
 * Kept at the root of `shared/` rather than inside `job-card/`, because the filter
 * panel of M11.6 lists the same members and would otherwise either import from a
 * card component or grow a second copy that drifts from it.
 */
const WORKPLACE_TYPE_LABELS: Record<WorkplaceType, string> = {
  REMOTE: 'Remote',
  ONSITE: 'On site',
  HYBRID: 'Hybrid',
};

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  INTERNSHIP: 'Internship',
  CONTRACT: 'Contract',
  // The German working-student contract. Kept under its English description
  // because the rest of the interface is English; the enum member is the contract.
  WORKING_STUDENT: 'Working student',
};

export function workplaceTypeLabel(type: WorkplaceType | null | undefined): string | null {
  return type ? WORKPLACE_TYPE_LABELS[type] : null;
}

export function employmentTypeLabel(type: EmploymentType | null | undefined): string | null {
  return type ? EMPLOYMENT_TYPE_LABELS[type] : null;
}
