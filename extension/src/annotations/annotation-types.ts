/** Icon category for visual distinction in annotations. */
export type AnnotationIcon = 'note' | 'warning' | 'bug' | 'star' | 'pin';

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
