// Deprecated: Local parsing removed in favor of LLM-only pipeline.
// This file remains only to avoid broken imports; do not use.
export function parseJstack() {
	console.warn('[deprecated] parseJstack is no-op; LLM-only pipeline is used.');
	return {};
}
