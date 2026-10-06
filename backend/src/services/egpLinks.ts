/**
 * Where "open the original source" points for e-GP tenders: the national
 * e-GP public announcement search, pre-filled with the project number. It
 * shows every stage of a project in one place, while Bangkok's own e-GP page
 * shows little beyond the attached files. Data is still collected from
 * whichever site has an API for it.
 */
const EGP_SEARCH_URL = "https://process5.gprocurement.go.th/egp-agpc01-web/announcement";

export function egpSearchUrl(projectNumber: string) {
  return `${EGP_SEARCH_URL}?keywordSearch=${encodeURIComponent(projectNumber)}`;
}
