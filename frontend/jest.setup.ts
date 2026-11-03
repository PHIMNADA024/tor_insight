// Adds DOM matchers such as toBeInTheDocument().
import "@testing-library/jest-dom";

// Radix components observe element sizes, but jsdom does not implement this API.
class ResizeObserverMock implements ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

global.ResizeObserver = ResizeObserverMock;
