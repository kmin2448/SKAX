// 각 구글 시트의 "탭별" 내용 해시를 저장해 두고, 바뀐 탭을 감지해 기록한 뒤
// 시트별 최신 수정 내역 1건씩을 반환하는 서버리스 함수.
// xlsx export(zip)를 직접 파싱해 탭 이름(xl/workbook.xml)과 탭별 내용(xl/worksheets/sheetN.xml)을 읽는다.
// 시트가 "링크가 있는 모든 사용자" 공유일 때만 동작한다 (인증 없이 export 접근).
const { createHash } = require("crypto");
const { inflateRawSync } = require("zlib");

const SB_URL = "https://ytkidrqfyguufyzfpwqy.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0a2lkcnFmeWd1dWZ5emZwd3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTYyMzMsImV4cCI6MjA5MTY5MjIzM30.sfIujbIeRyMWu6GfZ3d42vOOCEQBZMoBuYWEj-FlH30";
const SB = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

const SHEETS = [
  { key: "event", title: "행사운영", id: "1j3mOn0Np0kv9UzT_cb6lBVFahkWJkwOlrx4t1044w9k" },
  { key: "edu", title: "교육운영", id: "14PVCDzCXcEBTCx4e4vGfkTSTPivqsipQC4Ym_A6FHLA" }
];

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

// 최소한의 zip 리더 (central directory 순회 + raw deflate 해제)
function readZipEntries(buf) {
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error("EOCD not found");
  const count = buf.readUInt16LE(i + 10);
  let off = buf.readUInt32LE(i + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    entries[name] = { method, compSize, lho };
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipFile(buf, e) {
  const nameLen = buf.readUInt16LE(e.lho + 26);
  const extraLen = buf.readUInt16LE(e.lho + 28);
  const start = e.lho + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compSize);
  return e.method === 0 ? data : inflateRawSync(data);
}

// xlsx export에서 [{ name(탭 이름), hash(내용 해시) }] 목록 추출
async function sheetTabs(sheet) {
  const r = await fetch("https://docs.google.com/spreadsheets/d/" + sheet.id + "/export?format=xlsx", { redirect: "follow" });
  if (!r.ok) throw new Error("xlsx HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const entries = readZipEntries(buf);
  if (!entries["xl/workbook.xml"]) throw new Error("workbook.xml not found");
  const wb = readZipFile(buf, entries["xl/workbook.xml"]).toString("utf8");
  const names = [];
  const re = /<sheet[^>]*\sname="([^"]*)"/g;
  let m;
  while ((m = re.exec(wb))) names.push(decodeEntities(m[1]));
  return names
    .map((name, i) => {
      const e = entries["xl/worksheets/sheet" + (i + 1) + ".xml"];
      if (!e) return null;
      return { name, hash: createHash("sha256").update(readZipFile(buf, e)).digest("hex") };
    })
    .filter(Boolean);
}

module.exports = async (req, res) => {
  const debug = req.query && req.query.debug;
  const dbg = {};
  try {
    await Promise.all(SHEETS.map(async (sheet) => {
      let tabs;
      try { tabs = await sheetTabs(sheet); } catch (e) { if (debug) dbg[sheet.key] = String(e); return; }
      if (debug) dbg[sheet.key] = tabs.map(t => t.name);
      if (!tabs.length) return;

      const stRes = await fetch(
        SB_URL + "/rest/v1/skax_sheet_state?select=key,hash&key=like." + encodeURIComponent(sheet.key + ":*"),
        { headers: SB }
      );
      const stRows = stRes.ok ? await stRes.json() : [];
      const prevMap = Object.fromEntries(stRows.map(r => [r.key, r.hash]));
      const hadBaseline = stRows.length > 0; // 최초 실행이면 기준만 저장하고 변경 기록은 남기지 않음
      const now = new Date().toISOString();
      const upserts = [];
      const changes = [];

      for (const t of tabs) {
        const k = sheet.key + ":" + t.name;
        if (prevMap[k] === t.hash) continue;
        upserts.push({ key: k, hash: t.hash, changed_at: now });
        if (hadBaseline) changes.push({ key: sheet.key, tab: t.name, changed_at: now });
      }

      if (upserts.length) {
        await fetch(SB_URL + "/rest/v1/skax_sheet_state", {
          method: "POST",
          headers: Object.assign({ Prefer: "resolution=merge-duplicates" }, SB),
          body: JSON.stringify(upserts)
        });
      }
      if (changes.length) {
        await fetch(SB_URL + "/rest/v1/skax_sheet_changes", {
          method: "POST",
          headers: SB,
          body: JSON.stringify(changes)
        });
      }
    }));

    // 시트별 최신 1건씩만 반환
    const q = await fetch(
      SB_URL + "/rest/v1/skax_sheet_changes?select=key,tab,changed_at&order=changed_at.desc&limit=30",
      { headers: SB }
    );
    const rows = q.ok ? await q.json() : [];
    const titles = Object.fromEntries(SHEETS.map(s => [s.key, s.title]));
    const seen = new Set();
    const latest = [];
    for (const r of rows) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      latest.push({ key: r.key, title: titles[r.key] || r.key, tab: r.tab || null, changedAt: r.changed_at });
    }
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json(debug ? { changes: latest, debug: dbg } : { changes: latest });
  } catch (e) {
    res.status(200).json({ changes: [], error: String(e) });
  }
};
