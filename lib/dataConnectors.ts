// Airtable / Google Sheets "bring your own data" connector -- see
// db/migrations/0012_gap_features.sql's project_connectors table.
//
// v1 is a SNAPSHOT import, stated honestly in the UI: data is fetched
// once at connect/re-sync time and handed to the AI as real content to
// build the app around, not a live two-way sync. This is a deliberate
// choice, not a shortcut -- an Airtable personal access token isn't
// designed to be public the way a Supabase anon key is (see
// lib/supabaseBackend.ts), so embedding it in client-side generated JS
// the way the Supabase connector embeds its anon key would leak a real
// credential to anyone who views the published app's source. Fetching
// server-side and baking the resulting rows into the prompt avoids that
// entirely. Google Sheets needs no credential at all -- it only works
// against a sheet's own "Publish to web" CSV link, which is public by
// the user's own choice already.

// Papaparse ships without its own TypeScript types and this repo has no
// @types/papaparse -- a plain `require` with a loose type sidesteps
// needing a second package just for type declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Papa: any = require("papaparse");

export type DataSnapshot = { columns: string[]; rows: Record<string, string>[] };

const MAX_ROWS = 60; // Enough to build a real UI around; keeps the prompt payload sane.

export async function fetchAirtableSnapshot(token: string, baseId: string, table: string): Promise<{ ok: true; snapshot: DataSnapshot } | { ok: false; error: string }> {
  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?pageSize=${MAX_ROWS}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error: any) {
    return { ok: false, error: `Couldn't reach Airtable: ${error.message}` };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "That token was rejected by Airtable. Check it's correct and has access to this base." };
  }
  if (res.status === 404) {
    return { ok: false, error: "Base or table not found -- double-check the base ID and table name." };
  }
  if (!res.ok) {
    return { ok: false, error: `Airtable returned an error (${res.status}).` };
  }
  const json = await res.json();
  const records: any[] = json?.records ?? [];
  if (!records.length) {
    return { ok: false, error: "That table has no records to import yet." };
  }
  const columnSet = new Set<string>();
  for (const r of records) Object.keys(r.fields || {}).forEach((k) => columnSet.add(k));
  const columns = Array.from(columnSet);
  const rows = records.map((r) => {
    const row: Record<string, string> = {};
    for (const col of columns) row[col] = r.fields?.[col] != null ? String(r.fields[col]) : "";
    return row;
  });
  return { ok: true, snapshot: { columns, rows } };
}

export async function fetchSheetsSnapshot(csvUrl: string): Promise<{ ok: true; snapshot: DataSnapshot } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(csvUrl);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }
  if (!url.hostname.includes("docs.google.com") && !url.pathname.endsWith(".csv")) {
    return { ok: false, error: "Use the CSV link from Google Sheets' File -> Share -> Publish to web (choose CSV), not the normal editor link." };
  }

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (error: any) {
    return { ok: false, error: `Couldn't reach that URL: ${error.message}` };
  }
  if (!res.ok) {
    return { ok: false, error: `That link returned an error (${res.status}). Make sure the sheet is published to the web.` };
  }
  const text = await res.text();
  if (text.trim().startsWith("<") || text.includes("<html")) {
    return { ok: false, error: "That link returned a web page, not a CSV file -- use \"Publish to web\" and choose the CSV format link." };
  }

  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const rows: Record<string, string>[] = (parsed.data || []).slice(0, MAX_ROWS);
  if (!rows.length) {
    return { ok: false, error: "That sheet doesn't have any rows to import yet." };
  }
  const columns = parsed.meta?.fields ?? Object.keys(rows[0]);
  return { ok: true, snapshot: { columns, rows } };
}

/** Formats a snapshot as a compact block to prepend to a generation prompt -- see BuilderClient's use of it. */
export function formatSnapshotForPrompt(provider: string, snapshot: DataSnapshot): string {
  const preview = snapshot.rows.slice(0, MAX_ROWS);
  return [
    `REAL DATA (imported from ${provider === "airtable" ? "Airtable" : "Google Sheets"}, ${preview.length} row${preview.length === 1 ? "" : "s"}) -- use these exact records as the app's real content instead of inventing placeholder items:`,
    JSON.stringify(preview),
  ].join("\n");
}
