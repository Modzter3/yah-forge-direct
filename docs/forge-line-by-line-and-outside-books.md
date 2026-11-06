# Forge one chapter only, line by line (including outside books)

This summarizes how Yah Forge Direct handles **strict in-chapter** walks vs **outside (non-KJV) text**, and which toggles matter.

## Single Bible / apocrypha / sealed chapter — stay in that chapter

1. **Turn Cross Refs OFF**  
   When Cross Refs is **on**, the sermon prompt **requires** supporting cross-references from *other* books (per verse), while still anchoring on your chapter. That feels like “leaving” the chapter even though the spine stays verse-by-verse. With Cross Refs **off**, the prompt says to **stay on** the current book and chapter and walk verse by verse **without** pulling in outside books.

2. **Use the manual paste box when you want full control**  
   In KJV, Apocrypha, or Sealed panels, paste the exact text into **“Paste the chapter verses here…”**. When filled, the app skips auto-fetch and uses **only** that pasted block as `currentChapterText`. The model is instructed to quote and unpack **only** verses that appear in that block.

3. **Parts**  
   Multiple parts split **verse ranges** across parts so Part 1 should not preview later verses; very long chapters may need more parts or a larger model.

## Outside books (not scripture)

The same **“verse-by-verse only this text”** machinery is tied to **`currentChapterSource` + `currentChapterText`**. For *non-Bible* books it only engages when the paste is recognized as **scripture-shaped** (see `parseCustomScriptureInput` / `looksLikePastedScripture` in `public/index.html`).

### Option A — Custom forge (recommended for arbitrary books)

1. Put a **header line** the parser can read, e.g. `The Republic Chapter 7` or `Marcus Aurelius Meditations Chapter 2` (see `parseScriptureHeaderLine`).
2. Paste the passage with **numbered lines**: `1. First line...`, `2. Second line...`, etc. (enough numbered lines so it qualifies as pasted “scripture-like” text).
3. Forge from **Custom** so `currentChapterSource.type === 'custom'` and the strict **line-by-line in order** block applies.
4. **Cross Refs OFF** if you do not want mandatory citations from other books.

The UI may still say “scripture” in places; you are reusing the **same technical pipeline** for any text that matches the parser.

### Option B — Sealed scroll + manual paste

Use **Sealed Scroll** and paste into the manual paste area when the work fits that workflow. That also supplies `currentChapterText`. Sealed prompts add **heavy doctrine / discernment** layers — use only if that matches how you want to teach the text.

### What does *not* give strict line-by-line

If you paste **normal prose** into Custom with **no** verse-numbered structure, the app may classify it as a **briefing** (`briefingText`). The pasted-briefing block explicitly says **not** to make the sermon a line-by-line response to the paste — so that path is wrong for “explicate every line in order.”

## Quick checklist

| Goal | Cross Refs | Path |
|------|------------|------|
| One KJV/apocrypha/sealed chapter, no other books | **Off** | Chapter forge + optional manual paste |
| Outside book, line-by-line | **Off** | Custom + header + `1.` `2.` … numbering |
| Decode a pasted article as fuel, not line-by-line | Either | Briefing-style paste (avoid strict line-by-line expectation) |

## Related code (for maintainers)

- `buildPartPrompt` — chapter source, cross-reference branch, `VERSE-BY-VERSE` rules: `public/index.html`
- `parseCustomScriptureInput`, `looksLikePastedScripture`, `countVersesInText`: `public/index.html`
- `buildPastedBriefingSermonBlock` — briefing is **not** line-by-line: `public/index.html`
