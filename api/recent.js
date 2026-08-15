// 각 구글 시트의 최종 수정 시각을 조회해 반환하는 서버리스 함수.
// 시트가 "링크가 있는 모든 사용자" 공유일 때만 동작한다 (인증 없이 export 엔드포인트 접근).
const SHEETS = [
  { key: "event", title: "행사운영", id: "1j3mOn0Np0kv9UzT_cb6lBVFahkWJkwOlrx4t1044w9k" },
  { key: "edu", title: "교육운영", id: "14PVCDzCXcEBTCx4e4vGfkTSTPivqsipQC4Ym_A6FHLA" }
];

module.exports = async (req, res) => {
  const debug = req.query && req.query.debug;
  const results = await Promise.all(SHEETS.map(async (s) => {
    const out = { key: s.key, title: s.title, lastModified: null };
    try {
      const r = await fetch("https://docs.google.com/spreadsheets/d/" + s.id + "/export?format=csv", { redirect: "follow" });
      out.status = r.status;
      out.lastModified = r.headers.get("last-modified");
      if (debug) out.headers = Object.fromEntries(r.headers.entries());
      if (!out.lastModified) {
        // export 응답에 Last-Modified가 없으면 편집 페이지 HTML에서 밀리초 타임스탬프를 탐색
        const h = await fetch("https://docs.google.com/spreadsheets/d/" + s.id + "/edit", { redirect: "follow" });
        const text = await h.text();
        const m = text.match(/"lastModifiedMs"\s*:\s*"?(\d{13})/) ||
                  text.match(/lastModified["']?\s*[:=]\s*["']?(\d{13})/i) ||
                  text.match(/\blmt["']?\s*[:=]\s*["']?(\d{13})/i);
        if (m) out.lastModified = new Date(Number(m[1])).toUTCString();
        if (debug) {
          out.htmlStatus = h.status;
          out.htmlProbe = (text.match(/[\w-]*(?:lmt|odified)[\w-]*["']?\s*[:=]\s*["']?[^,}{"']{0,40}/gi) || []).slice(0, 20);
        }
      }
    } catch (e) {
      out.error = String(e);
    }
    return out;
  }));
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.status(200).json({ results });
};
