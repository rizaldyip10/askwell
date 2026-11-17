// Input limits (product owner decision) and allowed knowledge file types (project.md §3, §6.4).

/** Visitor chat message, in characters. */
export const MESSAGE_MAX_LENGTH = 1000;
/** Pasted knowledge text, in characters. */
export const KNOWLEDGE_TEXT_MAX_LENGTH = 50_000;
/** Uploaded knowledge file, in bytes (10 MB). The Storage bucket enforces the same limit. */
export const KNOWLEDGE_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const PROJECT_NAME_MAX_LENGTH = 60;
export const KNOWLEDGE_TITLE_MAX_LENGTH = 200;
export const KNOWLEDGE_FILE_NAME_MAX_LENGTH = 255;
export const WIDGET_LABEL_MAX_LENGTH = 40;
export const WIDGET_HEADER_TEXT_MAX_LENGTH = 60;

export const KNOWLEDGE_FILE_TYPES = {
  pdf: { extensions: [".pdf"], mimeTypes: ["application/pdf"] },
  md: { extensions: [".md", ".markdown"], mimeTypes: ["text/markdown", "text/x-markdown"] },
  txt: { extensions: [".txt"], mimeTypes: ["text/plain"] },
} as const satisfies Record<string, { extensions: readonly string[]; mimeTypes: readonly string[] }>;

export type KnowledgeFileType = keyof typeof KNOWLEDGE_FILE_TYPES;

export const KNOWLEDGE_FILE_TYPE_NAMES = Object.keys(KNOWLEDGE_FILE_TYPES) as KnowledgeFileType[];

/** Every MIME type the knowledge bucket accepts. */
export const KNOWLEDGE_ALLOWED_MIME_TYPES: readonly string[] = KNOWLEDGE_FILE_TYPE_NAMES.flatMap(
  (type) => KNOWLEDGE_FILE_TYPES[type].mimeTypes,
);

/** The knowledge file type for a file name, by its extension (case-insensitive), or null if not allowed. */
export function knowledgeFileTypeFromName(fileName: string): KnowledgeFileType | null {
  const lower = fileName.toLowerCase();
  for (const type of KNOWLEDGE_FILE_TYPE_NAMES) {
    const extensions: readonly string[] = KNOWLEDGE_FILE_TYPES[type].extensions;
    if (extensions.some((ext) => lower.endsWith(ext) && lower.length > ext.length)) return type;
  }
  return null;
}
