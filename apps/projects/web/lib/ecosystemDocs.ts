// Adapter to the ecosystem's Doc, Whiteboard and Spreadsheet editors.
// Standalone: the editors are not reachable, so `available` is false and people can only link documents that already exist.
// At integration, replace `ecosystemDocs` with an implementation whose create() asks the ecosystem to make the document
// and returns where it lives; the Docs view then offers "New doc / whiteboard / spreadsheet" automatically.
export type EcosystemDocKind = 'doc' | 'whiteboard' | 'sheet';

export interface EcosystemDocs {
  available: boolean;
  create(kind: EcosystemDocKind, projectId: string, title: string): Promise<{ url: string; title: string }>;
  open(url: string): void;
}

export const standaloneDocs: EcosystemDocs = {
  available: false,
  create() { return Promise.reject(new Error('The ecosystem editors are not connected in this standalone build.')); },
  open(url) { window.open(url, '_blank', 'noopener,noreferrer'); },
};

export let ecosystemDocs: EcosystemDocs = standaloneDocs;
/** Called once by the ecosystem shell at integration. */
export function setEcosystemDocs(impl: EcosystemDocs): void { ecosystemDocs = impl; }
