// Projects V2 inside the ecosystem keeps no file bytes of its own (owner decision 11 Nov 2026: task files go through Drive).
// Attachments and Collection files point at Drive files (files.id); removing one from a task or a collection only unlinks it,
// and the file itself follows Drive's own rules (trash, restore, storage cap). Nothing here deletes bytes.
export async function removeFiles(_keys: string[]): Promise<void> { /* Drive owns the bytes */ }
