/**
 * Shared grading and SQL identifier utilities for health scoring.
 * Extracted for Phase 2 modularization.
 */

/**
 * Map a numeric score (0–100) to a letter grade.
 */
export function toGrade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

/**
 * Escape a SQL identifier for double-quote quoting.
 */
export function sqlId(name: string): string {
  return name.replace(/"/g, '""');
}
