/** Icon category for visual distinction in annotations. */
export type AnnotationIcon = 'note' | 'warning' | 'bug' | 'star' | 'pin' | 'todo' | 'bookmark';

/** Emoji glyphs for each annotation icon — shared by tree decoration and webview panel. */
export const ANNOTATION_ICON_EMOJI: Record<AnnotationIcon, string> = {
  note: '\u{1F4A1}',
  warning: '\u26A0\uFE0F',
  bug: '\u{1F41B}',
  star: '\u2B50',
  pin: '\u{1F4CC}',
  todo: '\u{1F4CB}',
  bookmark: '\u{1F516}',
};

/** Which kind of database entity the annotation targets. */
export type AnnotationTargetKind = 'table' | 'column' | 'row';

/** Identifies the annotated database entity. */
export interface IAnnotationTarget {
  kind: AnnotationTargetKind;
  table: string;
  /** Column name (required when kind is 'column'). */
  column?: string;
  /** Primary key value as string (required when kind is 'row'). */
  rowPk?: string;
}

/** A single annotation entry. */
export interface IAnnotation {
  id: string;
  target: IAnnotationTarget;
  icon: AnnotationIcon;
  note: string;
  createdAt: number;
  updatedAt: number;
}

/** Shape used for JSON export/import. */
export interface IAnnotationExport {
  version: 1;
  exportedAt: string;
  annotations: IAnnotation[];
}
