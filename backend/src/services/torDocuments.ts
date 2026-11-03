/**
 * FR-03: the files a TOR links to, as one list the detail page can show.
 * Files are downloaded straight from the agency in their original format;
 * we only hand out the links, we never proxy or store the files.
 */
export type TorDocumentType = "tor" | "invitation" | "award" | "attachment";

export type TorDocument = {
  type: TorDocumentType;
  title?: string;
  url: string;
  format?: string;
};

type TorDocumentSource = {
  torPdfUrl?: string | null;
  invitationPdfUrl?: string | null;
  awardPdfUrl?: string | null;
  documents?: { title?: string | null; url?: string | null; format?: string | null }[] | null;
};

function isHttpUrl(url?: string | null): url is string {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** TOR first, then invitation, award and other attachments. Same URL is listed once. */
export function torDocuments(tor: TorDocumentSource): TorDocument[] {
  const candidates: TorDocument[] = [
    { type: "tor", url: tor.torPdfUrl ?? "", format: "pdf" },
    { type: "invitation", url: tor.invitationPdfUrl ?? "", format: "pdf" },
    { type: "award", url: tor.awardPdfUrl ?? "", format: "pdf" },
    ...(tor.documents ?? []).map((d) => ({
      type: "attachment" as const,
      title: d.title ?? undefined,
      url: d.url ?? "",
      format: d.format?.toLowerCase() ?? undefined,
    })),
  ];

  const seen = new Set<string>();
  return candidates.filter((d) => {
    if (!isHttpUrl(d.url) || seen.has(d.url)) return false;
    seen.add(d.url);
    return true;
  });
}