import { render, screen, waitFor } from "@testing-library/react";
import AdminLayout from "@/app/admin/layout";

const mockPush = jest.fn();
let mockAuthState: { user: { id: string; role: string } | null; isLoaded: boolean };
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuthState }));

beforeEach(() => {
  mockPush.mockReset();
  mockAuthState = { user: { id: "user-1", role: "end_user" }, isLoaded: true };
});

describe("Admin layout", () => {
  it("redirects a signed-in non-admin and does not render protected content", async () => {
    render(<AdminLayout><div>Admin-only content</div></AdminLayout>);

    expect(screen.getByText("กำลังตรวจสอบสิทธิ์...")).toBeInTheDocument();
    expect(screen.queryByText("Admin-only content")).not.toBeInTheDocument();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("redirects unauthenticated users to login", async () => {
    mockAuthState = { user: null, isLoaded: true };
    render(<AdminLayout><div>Admin-only content</div></AdminLayout>);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Admin-only content")).not.toBeInTheDocument();
  });
});
