import { z } from 'zod';

/**
 * Zod schemas for the Relias `POST /api/coursesearch` response.
 *
 * Modeled from a real capture (2026-05-26). We validate only the fields the
 * library depends on; Zod strips unknown keys by default, so new Relias fields
 * won't break us — but a *missing* field we rely on (e.g. `courseCode` renamed)
 * fails validation, which the search client surfaces as schema drift (exit code
 * 2 at the CLI). Course data lives nested under `courseInfo[0]`.
 */

/** The course detail object (one element of the `courseInfo` array). */
export const reliasCourseInfoSchema = z.object({
  courseID: z.number(),
  courseTitle: z.string(),
  courseCode: z.string(),
  /** Display string, e.g. "1.00". */
  courseHours: z.string(),
  /** Numeric hours, e.g. 0.15 — the value reconciliation compares. */
  courseHoursNumeric: z.number(),
  courseType: z.number(),
  courseDescription: z.string().nullable(),
  courseArchiveDate: z.string().nullable(),
  releaseDate: z.string().nullable(),
});

/** One entry in the `courses` array — wraps `courseInfo`. */
export const reliasCourseEntrySchema = z.object({
  orgID: z.number(),
  courseDeleted: z.boolean(),
  courseInfo: z.array(reliasCourseInfoSchema).min(1),
});

/** The full coursesearch response envelope. */
export const reliasSearchResponseSchema = z.object({
  courses: z.array(reliasCourseEntrySchema),
  totalCount: z.number(),
});

export type ReliasCourseInfo = z.infer<typeof reliasCourseInfoSchema>;
export type ReliasCourseEntry = z.infer<typeof reliasCourseEntrySchema>;
export type ReliasSearchResponse = z.infer<typeof reliasSearchResponseSchema>;
