import { torDocuments } from "../../src/services/torDocuments.js";

describe("torDocuments", () => {
  it("lists TOR, invitation and award PDFs in that order", () => {
    const docs = torDocuments({
      invitationPdfUrl: "https://egp2.bangkok.go.th/api/file/1/invite.pdf",
      torPdfUrl: "https://egp2.bangkok.go.th/api/file/2/tor.pdf",
      awardPdfUrl: "https://egp2.bangkok.go.th/api/file/3/award.pdf",
    });

    expect(docs.map((d) => d.type)).toEqual(["tor", "invitation", "award"]);
    expect(docs[0]).toEqual({
      type: "tor",
      url: "https://egp2.bangkok.go.th/api/file/2/tor.pdf",
      format: "pdf",
    });
  });

  it("lists a URL once when the TOR falls back to the invitation", () => {
    const url = "https://egp2.bangkok.go.th/api/file/1/invite.pdf";
    const docs = torDocuments({ torPdfUrl: url, invitationPdfUrl: url });

    expect(docs).toHaveLength(1);
    expect(docs[0].type).toBe("tor");
  });

  it("adds attachments with their title and format", () => {
    const docs = torDocuments({
      documents: [{ title: "แบบรูป", url: "https://example.go.th/plan.zip", format: "ZIP" }],
    });

    expect(docs).toEqual([
      { type: "attachment", title: "แบบรูป", url: "https://example.go.th/plan.zip", format: "zip" },
    ]);
  });

  it("drops empty and non-http links", () => {
    const docs = torDocuments({
      torPdfUrl: "",
      invitationPdfUrl: "javascript:alert(1)",
      documents: [{ title: "x", url: "not a url" }],
    });

    expect(docs).toEqual([]);
  });

  it("returns an empty list when there is nothing", () => {
    expect(torDocuments({})).toEqual([]);
  });
});