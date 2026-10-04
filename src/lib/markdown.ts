// ---------------------------------------------------------------------------
// Markdown helpers shared by anything that needs a PLAIN-TEXT projection of
// user-written Markdown (meta descriptions, one-line previews, future feeds).
// The display side lives in components/Markdown.tsx, which builds React
// elements directly — this file never renders HTML either.
// ---------------------------------------------------------------------------

/**
 * Flatten Markdown to a single clean line of readable text: fenced and
 * inline code become their content, emphasis/link/list/heading markers are
 * removed (link TARGETS are dropped, their labels kept). Used so a bio like
 * "### What I build / **Bots** …" never leaks syntax into <meta description>.
 *
 * Deliberately mirrors only what components/Markdown.tsx renders (`*italic*`,
 * never `_italic_`) — so `snake_case_names` survive untouched.
 */
export function stripMarkdown(md: string): string {
  return (md || '')
    .replace(/\r\n?/g, '\n')
    // fenced code block (with optional language) -> keep the code content
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/```([^\n]*)/g, '$1') // unterminated fence -> drop the marker
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/^\s{0,3}>\s?/gm, '') // blockquotes
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '') // list markers
    .replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, '') // horizontal rules
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [label](url) -> label
    .replace(/`([^`\n]+)`/g, '$1') // inline code
    .replace(/\*\*([^*\n]+)\*\*/g, '$1') // bold
    .replace(/\*([^*\n]+)\*/g, '$1') // italic
    .replace(/\s+/g, ' ') // collapse newlines/indentation
    .trim();
}
