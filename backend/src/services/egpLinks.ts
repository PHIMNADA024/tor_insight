/**
 * Where "open the original source" points for national e-GP tenders: the
 * public announcement search, pre-filled with the project number. (Bangkok's
 * e-GP projects aren't found there, so those link to egp2 instead.)
 */
const EGP_SEARCH_URL = "https://process5.gprocurement.go.th/egp-agpc01-web/announcement";

export function egpSearchUrl(projectNumber: string) {
  return `${EGP_SEARCH_URL}?keywordSearch=${encodeURIComponent(projectNumber)}`;
}
