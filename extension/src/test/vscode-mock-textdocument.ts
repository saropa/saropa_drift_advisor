/**
 * TextDocument / WorkspaceEdit mocks for testing code paths that read a
 * document's line text and apply an insert edit (e.g. suppression-commands.ts).
 * Deliberately minimal: only the members those call sites actually use.
 */

export class MockTextDocument {
  constructor(
    public readonly uri: any,
    private readonly _lines: string[],
  ) {}

  get lineCount(): number {
    return this._lines.length;
  }

  lineAt(line: number): { text: string } {
    return { text: this._lines[line] ?? '' };
  }
}

/** Records inserts; mirrors just the `.insert()` surface WorkspaceEdit callers use. */
export class WorkspaceEdit {
  readonly inserts: Array<{ uri: any; position: any; text: string }> = [];

  insert(uri: any, position: any, text: string): void {
    this.inserts.push({ uri, position, text });
  }
}

/** Registry a test populates so `workspace.openTextDocument(uri)` returns a fixture. */
export const mockTextDocuments = new Map<string, MockTextDocument>();

/** Every WorkspaceEdit passed to the mocked `workspace.applyEdit`, in order. */
export const appliedEdits: WorkspaceEdit[] = [];

export function resetTextDocumentMocks(): void {
  mockTextDocuments.clear();
  appliedEdits.length = 0;
}
