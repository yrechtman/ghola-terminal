import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import DATA from "./data.json";

// ============================================================
// DATA
// ============================================================

// Scoring weights — from API via data.json, with hardcoded fallback
const SCORING_FALLBACK = { FGM: 2, FGA: -1, "3PTM": 1, FTM: 1, FTA: -1, PTS: 1, REB: 1, AST: 2, ST: 4, BLK: 4, TO: -2 };
const SCORING = (DATA.LEAGUE_INFO && Object.keys(DATA.LEAGUE_INFO.scoring || {}).length > 0) ? DATA.LEAGUE_INFO.scoring : SCORING_FALLBACK;

// Team map — from API via data.json, with hardcoded fallback
const TEAM_MAP_FALLBACK = {
  2: "tleilaxu", 3: "Light Years Ahead", 4: "RG Kush",
  5: "Team sugar boo boo", 6: "cam thomas jefferson", 7: "team tall white boi",
  8: "team hyphen", 9: "Big Spite Guys", 10: "The Cooper Flaggots", 11: "The Travel Agency"
};
const TEAM_MAP = DATA.TEAM_MAP || TEAM_MAP_FALLBACK;

const MY_TEAM = "tleilaxu";

const LOTTERY_ODDS = {
  10: [40, 30, 20, 10, 0],
  9: [30, 25, 25, 15, 5],
  8: [20, 25, 30, 20, 5],
  7: [7, 12, 15, 40, 26],
  6: [3, 8, 10, 15, 64],
};

const { DRAFT_PICKS, STANDINGS, RAW_CSV } = DATA;
const PLAYER_PROPS = DATA.PLAYER_PROPS || {};
const DYNASTY_ADP = DATA.DYNASTY_ADP || {};

function normalizeName(name) {
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function parseCSVLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  cols.push(current.trim());
  return cols;
}

// Map CSV column indices to scoring category keys
const STAT_COLS = { 10: "FGM", 11: "FGA", 12: "3PTM", 13: "FTM", 14: "FTA", 15: "PTS", 16: "REB", 17: "AST", 18: "ST", 19: "BLK", 20: "TO" };
// Also check alternate key names the API might return (e.g. "STL" vs "ST")
const scoringVal = (key) => SCORING[key] ?? SCORING[key === "ST" ? "STL" : key === "STL" ? "ST" : key] ?? 0;

function parseCSV(raw, teamNum) {
  const teamName = TEAM_MAP[teamNum];
  return raw.split("\n").filter(Boolean).map(line => {
    const cols = parseCSVLine(line);
    const s = (i) => parseFloat(cols[i]) || 0;
    let customFPG = 0;
    for (const [col, key] of Object.entries(STAT_COLS)) {
      customFPG += s(parseInt(col)) * scoringVal(key);
    }
    const gp = s(9);
    const name = cols[2];
    const props = PLAYER_PROPS[normalizeName(name)] || null;
    const fantraxId = (cols[0] || "").replace(/^\*|\*$/g, "");
    const adp = DYNASTY_ADP[fantraxId] ?? null;
    return {
      id: cols[0], pos: cols[1], name, nbaTeam: cols[3], eligible: cols[4],
      status: cols[5], age: parseInt(cols[6]) || 0, totalFP: s(7), fantraxFPG: s(8),
      gp, customFPG: Math.round(customFPG * 10) / 10,
      totalCustomFP: Math.round(customFPG * gp),
      projSeasonFP: Math.round(customFPG * 82),
      fgm: s(10), fga: s(11), threes: s(12), ftm: s(13), fta: s(14),
      pts: s(15), reb: s(16), ast: s(17), stl: s(18), blk: s(19), to: s(20),
      fgEff: Math.round((s(10) * (SCORING.FGM || 2) + s(11) * (SCORING.FGA || -1)) * 10) / 10,
      fantasyTeam: teamName,
      props,  // today's PrizePicks lines, or null if no game
      adp,    // dynasty ADP rank, or null if unknown
    };
  });
}

const allPlayers = Object.entries(RAW_CSV).flatMap(([k, v]) => parseCSV(v, parseInt(k)));

// ============================================================
// STYLES
// ============================================================

const C = {
  bg: "#0a0a0a", panel: "#111111", border: "#1a1a1a",
  amber: "#ff8c00", green: "#00ff41", cyan: "#00e5ff", red: "#ff3333",
  white: "#e0e0e0", dim: "#999999", dimmer: "#444444",
  yellow: "#ffd700", magenta: "#ff00ff",
};

const ageColor = (age) => age < 24 ? C.green : age <= 28 ? C.yellow : age <= 31 ? C.amber : C.red;
const statusColor = (s) => s === "Act" ? C.green : s === "Res" ? C.amber : s === "IR" ? C.red : C.cyan;
const deltaColor = (v) => v > 0 ? C.green : v < 0 ? C.red : C.dim;

// Tags
const TAG_COLORS = { IRON: C.green, DUR: C.cyan, FRAG: C.red, YNG: C.magenta, SELL: C.amber, HOLD: C.yellow, BUY: "#00ff88" };
const ALL_TAGS = Object.keys(TAG_COLORS);
function getAutoTags(p, forMyTeam = false) {
  const tags = [];
  if (p.gp >= 60) tags.push("IRON");
  else if (p.gp >= 55) tags.push("DUR");
  if (p.gp > 0 && p.gp <= 30) tags.push("FRAG");
  if (p.age <= 23) tags.push("YNG");
  if (forMyTeam && p.age >= 29) tags.push("SELL");
  return tags;
}

const font = "'IBM Plex Mono', 'Fira Code', 'Courier New', monospace";

const styles = {
  app: { background: C.bg, color: C.white, fontFamily: font, fontSize: 12, minHeight: "100vh", padding: 0 },
  header: { background: "#050505", borderBottom: `1px solid ${C.amber}`, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { color: C.amber, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
  tabs: { display: "flex", gap: 0, background: "#080808", borderBottom: `1px solid ${C.dimmer}` },
  tab: (active) => ({
    padding: "8px 20px", cursor: "pointer", fontSize: 11, fontWeight: 600, letterSpacing: 1,
    textTransform: "uppercase", fontFamily: font, border: "none",
    background: active ? C.panel : "transparent",
    color: active ? C.amber : C.dim,
    borderBottom: active ? `2px solid ${C.amber}` : "2px solid transparent",
    borderTop: "none", borderLeft: "none", borderRight: `1px solid ${C.dimmer}`,
  }),
  content: { padding: 16 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 11 },
  th: { textAlign: "left", padding: "6px 8px", color: C.amber, borderBottom: `1px solid ${C.dimmer}`, fontWeight: 600, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" },
  thR: { textAlign: "right", padding: "6px 8px", color: C.amber, borderBottom: `1px solid ${C.dimmer}`, fontWeight: 600, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" },
  td: { padding: "5px 8px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" },
  tdR: { padding: "5px 8px", borderBottom: `1px solid ${C.border}`, textAlign: "right", whiteSpace: "nowrap" },
  sectionHeader: { color: C.cyan, fontSize: 11, fontWeight: 700, padding: "12px 8px 6px", letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.cyan}33` },
  badge: (color) => ({
    display: "inline-block", padding: "1px 5px", fontSize: 9, fontWeight: 700,
    border: `1px solid ${color}`, color, borderRadius: 2, marginLeft: 4, letterSpacing: 1,
  }),
  stat: { color: C.dim },
  myTeamRow: { borderLeft: `3px solid ${C.amber}`, background: "#0d0d00" },
  card: { background: C.panel, border: `1px solid ${C.dimmer}`, padding: 16, marginBottom: 12 },
  cardTitle: { color: C.amber, fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: 1 },
  bigNum: { fontSize: 28, fontWeight: 700, fontFamily: font },
  label: { fontSize: 9, color: C.dim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  expandBtn: { background: "none", border: "none", color: C.cyan, cursor: "pointer", fontFamily: font, fontSize: 11, padding: "4px 0" },
  select: { background: C.panel, color: C.white, border: `1px solid ${C.dimmer}`, padding: "6px 10px", fontFamily: font, fontSize: 11 },
  searchInput: { background: "#0d0d0d", color: C.white, border: `1px solid ${C.dimmer}`, padding: "6px 10px", fontFamily: font, fontSize: 11, width: 200 },
};

// ============================================================
// COMPONENTS
// ============================================================

function PlayerRow({ p, showTeam = false, highlight = false, showProps = false, tags, onTagClick, onTagAdd }) {
  const [picking, setPicking] = useState(false);
  const rowStyle = highlight ? styles.myTeamRow : {};
  const displayTags = tags !== undefined ? tags : getAutoTags(p, highlight);
  const addable = ALL_TAGS.filter(t => !displayTags.includes(t));
  const canEdit = !!onTagClick;

  return (
    <tr style={rowStyle}>
      <td style={styles.td}>
        <span style={{ color: C.white, fontWeight: 600 }}>{p.name}</span>
        {displayTags.map(tag => (
          <span
            key={tag}
            style={{ ...styles.badge(TAG_COLORS[tag] || C.dim), cursor: canEdit ? "pointer" : "default", opacity: canEdit ? 0.9 : 1 }}
            title={canEdit ? "Click to remove" : undefined}
            onClick={canEdit ? () => onTagClick(p, tag) : undefined}
          >{tag}</span>
        ))}
        {canEdit && !picking && addable.length > 0 && (
          <span
            style={{ ...styles.badge(C.dimmer), cursor: "pointer", color: C.dim, borderColor: C.dimmer }}
            onClick={() => setPicking(true)}
            title="Add tag"
          >+</span>
        )}
        {canEdit && picking && (
          <span style={{ marginLeft: 4 }}>
            {addable.map(tag => (
              <span
                key={tag}
                style={{ ...styles.badge(TAG_COLORS[tag] || C.dim), cursor: "pointer", opacity: 0.6 }}
                onClick={() => { onTagAdd(p, tag); setPicking(false); }}
              >{tag}</span>
            ))}
            <span
              style={{ ...styles.badge(C.dimmer), cursor: "pointer", color: C.dim, marginLeft: 2 }}
              onClick={() => setPicking(false)}
            >×</span>
          </span>
        )}
      </td>
      {showTeam && <td style={{ ...styles.td, color: p.fantasyTeam === MY_TEAM ? C.amber : C.white, fontSize: 10 }}>{p.fantasyTeam}</td>}
      <td style={{ ...styles.td, color: C.white, fontSize: 10 }}>{p.nbaTeam}</td>
      <td style={{ ...styles.td, color: C.white }}>{p.pos}</td>
      <td style={{ ...styles.td, color: C.dim, fontSize: 10 }}>{p.eligible}</td>
      <td style={{ ...styles.td, color: statusColor(p.status), fontWeight: 700, fontSize: 10 }}>{p.status}</td>
      <td style={{ ...styles.tdR, color: ageColor(p.age), fontWeight: 700 }}>{p.age}</td>
      <td style={{ ...styles.tdR, fontWeight: 700 }}>{p.gp}</td>
      <td style={{ ...styles.tdR, color: C.green, fontWeight: 700 }}>{p.customFPG}</td>
      <td style={styles.tdR}>{p.totalCustomFP}</td>
      <td style={{ ...styles.tdR, color: C.white }}>{p.projSeasonFP}</td>
      {showProps && (
        <td style={{ ...styles.tdR, color: p.props ? C.cyan : C.dimmer, fontSize: 10, fontWeight: p.props ? 700 : 400 }}>
          {p.props ? `${p.props.pts ?? "?"}/${p.props.reb ?? "?"}/${p.props.ast ?? "?"}` : "—"}
        </td>
      )}
      {showProps && (
        <td style={{ ...styles.tdR, color: p.adp != null ? C.white : C.dimmer, fontSize: 10 }}>
          {p.adp != null ? p.adp : "—"}
        </td>
      )}
    </tr>
  );
}

function TableHeader({ showTeam = false, showProps = false }) {
  return (
    <thead>
      <tr>
        <th style={styles.th}>Player</th>
        {showTeam && <th style={styles.th}>Team</th>}
        <th style={styles.th}>NBA</th>
        <th style={styles.th}>Pos</th>
        <th style={styles.th}>Elig</th>
        <th style={styles.th}>Sts</th>
        <th style={styles.thR}>Age</th>
        <th style={styles.thR}>GP</th>
        <th style={styles.thR}>FPG</th>
        <th style={styles.thR}>TotFP</th>
        <th style={styles.thR}>Proj82</th>
        {showProps && <th style={{ ...styles.thR, color: C.cyan }}>P/R/A</th>}
        {showProps && <th style={{ ...styles.thR, color: C.cyan }}>ADP</th>}
      </tr>
    </thead>
  );
}

// ============================================================
// TAB 1: MY ROSTER
// ============================================================

function MyRoster() {
  const [tagOverrides, setTagOverrides] = useState({});
  const myPlayers = allPlayers.filter(p => p.fantasyTeam === MY_TEAM);
  const groups = { Act: [], Res: [], IR: [], Min: [] };
  myPlayers.forEach(p => { if (groups[p.status]) groups[p.status].push(p); });
  Object.values(groups).forEach(g => g.sort((a, b) => b.customFPG - a.customFPG));

  const getPlayerTags = (p) => tagOverrides[p.id] !== undefined ? tagOverrides[p.id] : getAutoTags(p, true);
  const handleTagClick = (p, tag) => setTagOverrides(prev => ({ ...prev, [p.id]: getPlayerTags(p).filter(t => t !== tag) }));
  const handleTagAdd = (p, tag) => setTagOverrides(prev => ({ ...prev, [p.id]: [...getPlayerTags(p), tag] }));

  const active = groups.Act;
  const activeFPG = active.reduce((s, p) => s + p.customFPG, 0);
  const avgAge = active.length ? (active.reduce((s, p) => s + p.age, 0) / active.length).toFixed(1) : 0;

  const chartData = myPlayers.filter(p => p.gp > 0).sort((a, b) => b.customFPG - a.customFPG).map(p => ({
    name: p.name.split(" ").pop(), fpg: p.customFPG, age: p.age
  }));

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "Active FPG Sum", value: activeFPG.toFixed(1), color: C.green },
          { label: "Active Players", value: active.length, color: C.white },
          { label: "Total Roster", value: myPlayers.length, color: C.white },
          { label: "Avg Active Age", value: avgAge, color: parseFloat(avgAge) > 28 ? C.amber : C.green },
          { label: "League Rank", value: `#${STANDINGS.find(s => s.team === MY_TEAM)?.rank || "?"}/10`, color: C.red },
          { label: "Record", value: (() => { const s = STANDINGS.find(s => s.team === MY_TEAM); return s ? `${s.w}-${s.l}` : "?"; })(), color: C.red },
        ].map((s, i) => (
          <div key={i} style={{ ...styles.card, flex: 1, minWidth: 120 }}>
            <div style={styles.label}>{s.label}</div>
            <div style={{ ...styles.bigNum, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...styles.card, marginBottom: 16, height: 200 }}>
        <div style={styles.cardTitle}>ROSTER VALUE DISTRIBUTION</div>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis dataKey="name" tick={{ fill: C.dim, fontSize: 9, fontFamily: font }} angle={-45} textAnchor="end" height={60} />
            <YAxis tick={{ fill: C.dim, fontSize: 9, fontFamily: font }} />
            <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.amber}`, fontFamily: font, fontSize: 11 }} />
            <Bar dataKey="fpg" name="Custom FPG">
              {chartData.map((entry, i) => (
                <Cell key={i} fill={ageColor(entry.age)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <TableHeader showProps />
          <tbody>
            {[
              { key: "Act", label: "ACTIVE ROSTER" },
              { key: "Res", label: "RESERVE" },
              { key: "IR", label: "INJURED RESERVE" },
              { key: "Min", label: "MINOR LEAGUE" },
            ].map(({ key, label }) => (
              groups[key].length > 0 && [
                <tr key={`h-${key}`}><td colSpan={13} style={styles.sectionHeader}>{label} ({groups[key].length})</td></tr>,
                ...groups[key].map(p => <PlayerRow key={p.id} p={p} highlight showProps tags={getPlayerTags(p)} onTagClick={handleTagClick} onTagAdd={handleTagAdd} />)
              ]
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// TAB 2: LEAGUE LANDSCAPE
// ============================================================

function LeagueLandscape() {
  const [expanded, setExpanded] = useState(null);

  const teams = useMemo(() => {
    return Object.values(TEAM_MAP).map(t => {
      const roster = allPlayers.filter(p => p.fantasyTeam === t);
      const active = roster.filter(p => p.status === "Act");
      const fpgSum = active.reduce((s, p) => s + p.customFPG, 0);
      const avgAge = active.length ? active.reduce((s, p) => s + p.age, 0) / active.length : 0;
      const top3 = [...active].sort((a, b) => b.customFPG - a.customFPG).slice(0, 3);
      return { name: t, roster, active, fpgSum: Math.round(fpgSum * 10) / 10, avgAge: avgAge.toFixed(1), top3, total: roster.length };
    }).sort((a, b) => b.fpgSum - a.fpgSum);
  }, []);

  return (
    <div>
      <div style={{ ...styles.card, marginBottom: 16, height: 220 }}>
        <div style={styles.cardTitle}>TEAM POWER RANKINGS - ACTIVE ROSTER FPG</div>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={teams} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 120 }}>
            <XAxis type="number" tick={{ fill: C.dim, fontSize: 9, fontFamily: font }} />
            <YAxis type="category" dataKey="name" tick={{ fill: C.dim, fontSize: 10, fontFamily: font }} width={120} />
            <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.amber}`, fontFamily: font, fontSize: 11 }} />
            <Bar dataKey="fpgSum" name="Active FPG Sum">
              {teams.map((t, i) => (
                <Cell key={i} fill={t.name === MY_TEAM ? C.amber : C.cyan} fillOpacity={t.name === MY_TEAM ? 1 : 0.5} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>#</th>
            <th style={styles.th}>Team</th>
            <th style={styles.thR}>FPG Sum</th>
            <th style={styles.thR}>Record</th>
            <th style={styles.th}>Top 3</th>
            <th style={styles.thR}>Avg Age</th>
            <th style={styles.thR}>Roster</th>
            <th style={styles.th}>Type</th>
            <th style={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => {
            const isMe = t.name === MY_TEAM;
            const standing = STANDINGS.find(s => s.team === t.name);
            const isContender = standing ? standing.rank <= 5 : i < 5;
            return [
              <tr key={t.name} style={isMe ? styles.myTeamRow : {}}>
                <td style={{ ...styles.td, color: C.white }}>{i + 1}</td>
                <td style={{ ...styles.td, color: isMe ? C.amber : C.white, fontWeight: isMe ? 700 : 400 }}>{t.name}</td>
                <td style={{ ...styles.tdR, color: C.green, fontWeight: 700 }}>{t.fpgSum}</td>
                <td style={{ ...styles.tdR, color: standing && standing.rank <= 5 ? C.green : C.red, fontSize: 10 }}>{standing ? `${standing.w}-${standing.l}` : "?"}</td>
                <td style={{ ...styles.td, fontSize: 10, color: C.white }}>{t.top3.map(p => `${p.name.split(" ").pop()} (${p.customFPG})`).join(", ")}</td>
                <td style={{ ...styles.tdR, color: parseFloat(t.avgAge) > 29 ? C.amber : C.white }}>{t.avgAge}</td>
                <td style={styles.tdR}>{t.total}</td>
                <td style={styles.td}>
                  <span style={styles.badge(isContender ? C.green : C.red)}>{isContender ? "CONTENDER" : "REBUILD"}</span>
                </td>
                <td style={styles.td}>
                  <button style={styles.expandBtn} onClick={() => setExpanded(expanded === t.name ? null : t.name)}>
                    {expanded === t.name ? "[-]" : "[+]"}
                  </button>
                </td>
              </tr>,
              expanded === t.name && (
                <tr key={`${t.name}-exp`}>
                  <td colSpan={8} style={{ padding: 0 }}>
                    <div style={{ background: "#080808", padding: "8px 16px" }}>
                      <table style={styles.table}>
                        <TableHeader />
                        <tbody>
                          {[...t.roster].sort((a, b) => b.customFPG - a.customFPG).map(p => (
                            <PlayerRow key={p.id} p={p} highlight={isMe} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// TAB 3: TRADE ANALYZER
// ============================================================

function TradeAnalyzer() {
  const [sending, setSending] = useState([]);
  const [receiving, setReceiving] = useState([]);
  const [searchSend, setSearchSend] = useState("");
  const [searchRecv, setSearchRecv] = useState("");

  const myPlayers = allPlayers.filter(p => p.fantasyTeam === MY_TEAM);
  const otherPlayers = allPlayers.filter(p => p.fantasyTeam !== MY_TEAM);

  const filteredSend = myPlayers.filter(p => p.name.toLowerCase().includes(searchSend.toLowerCase()) && !sending.find(s => s.id === p.id));
  const filteredRecv = otherPlayers.filter(p => p.name.toLowerCase().includes(searchRecv.toLowerCase()) && !receiving.find(r => r.id === p.id));

  const sendFPG = sending.reduce((s, p) => s + p.customFPG, 0);
  const recvFPG = receiving.reduce((s, p) => s + p.customFPG, 0);
  const sendAge = sending.length ? sending.reduce((s, p) => s + p.age, 0) / sending.length : 0;
  const recvAge = receiving.length ? receiving.reduce((s, p) => s + p.age, 0) / receiving.length : 0;
  const sendGP = sending.reduce((s, p) => s + p.gp, 0);
  const recvGP = receiving.reduce((s, p) => s + p.gp, 0);
  const sendProj = sending.reduce((s, p) => s + p.projSeasonFP, 0);
  const recvProj = receiving.reduce((s, p) => s + p.projSeasonFP, 0);

  const fpgDelta = recvFPG - sendFPG;
  const ageDelta = recvAge - sendAge;
  const projDelta = recvProj - sendProj;

  const removeSend = (id) => setSending(s => s.filter(p => p.id !== id));
  const removeRecv = (id) => setReceiving(r => r.filter(p => p.id !== id));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* SENDING */}
        <div style={styles.card}>
          <div style={{ ...styles.cardTitle, color: C.red }}>SENDING (tleilaxu)</div>
          <input style={styles.searchInput} placeholder="Search your players..." value={searchSend} onChange={e => setSearchSend(e.target.value)} />
          {searchSend && (
            <div style={{ maxHeight: 150, overflowY: "auto", border: `1px solid ${C.dimmer}`, marginTop: 4 }}>
              {filteredSend.slice(0, 10).map(p => (
                <div key={p.id} style={{ padding: "4px 8px", cursor: "pointer", fontSize: 11, borderBottom: `1px solid ${C.border}` }}
                  onClick={() => { setSending(s => [...s, p]); setSearchSend(""); }}>
                  {p.name} <span style={{ color: C.dim }}>({p.customFPG} FPG, {p.status})</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            {sending.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                <span>{p.name} <span style={{ color: C.dim }}>({p.customFPG})</span></span>
                <button style={{ ...styles.expandBtn, color: C.red }} onClick={() => removeSend(p.id)}>X</button>
              </div>
            ))}
          </div>
        </div>

        {/* RECEIVING */}
        <div style={styles.card}>
          <div style={{ ...styles.cardTitle, color: C.green }}>RECEIVING</div>
          <input style={styles.searchInput} placeholder="Search league players..." value={searchRecv} onChange={e => setSearchRecv(e.target.value)} />
          {searchRecv && (
            <div style={{ maxHeight: 150, overflowY: "auto", border: `1px solid ${C.dimmer}`, marginTop: 4 }}>
              {filteredRecv.slice(0, 10).map(p => (
                <div key={p.id} style={{ padding: "4px 8px", cursor: "pointer", fontSize: 11, borderBottom: `1px solid ${C.border}` }}
                  onClick={() => { setReceiving(r => [...r, p]); setSearchRecv(""); }}>
                  {p.name} <span style={{ color: C.dim }}>({p.fantasyTeam}, {p.customFPG} FPG)</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            {receiving.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                <span>{p.name} <span style={{ color: C.dim }}>({p.customFPG}, {p.fantasyTeam})</span></span>
                <button style={{ ...styles.expandBtn, color: C.red }} onClick={() => removeRecv(p.id)}>X</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(sending.length > 0 || receiving.length > 0) && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <div style={styles.cardTitle}>TRADE ANALYSIS</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Metric</th>
                <th style={styles.thR}>Sending</th>
                <th style={styles.thR}>Receiving</th>
                <th style={styles.thR}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Custom FPG", send: sendFPG.toFixed(1), recv: recvFPG.toFixed(1), delta: fpgDelta.toFixed(1), d: fpgDelta },
                { label: "Avg Age", send: sendAge.toFixed(1), recv: recvAge.toFixed(1), delta: (ageDelta > 0 ? "+" : "") + ageDelta.toFixed(1), d: -ageDelta },
                { label: "Total GP (durability)", send: sendGP, recv: recvGP, delta: recvGP - sendGP, d: recvGP - sendGP },
                { label: "Proj Season FP (x82)", send: sendProj.toLocaleString(), recv: recvProj.toLocaleString(), delta: projDelta.toLocaleString(), d: projDelta },
              ].map((r, i) => (
                <tr key={i}>
                  <td style={styles.td}>{r.label}</td>
                  <td style={{ ...styles.tdR, color: C.red }}>{r.send}</td>
                  <td style={{ ...styles.tdR, color: C.green }}>{r.recv}</td>
                  <td style={{ ...styles.tdR, color: deltaColor(r.d), fontWeight: 700 }}>{r.delta > 0 ? "+" : ""}{r.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sending.length > 0 && receiving.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, background: "#080808", border: `1px solid ${C.dimmer}`, fontSize: 11, lineHeight: 1.6 }}>
              <span style={{ color: C.amber }}>SUMMARY: </span>
              You send <span style={{ color: C.red }}>{sendFPG.toFixed(1)} FPG</span> (avg age {sendAge.toFixed(1)}) and receive{" "}
              <span style={{ color: C.green }}>{recvFPG.toFixed(1)} FPG</span> (avg age {recvAge.toFixed(1)}).{" "}
              {fpgDelta >= 0
                ? <span style={{ color: C.green }}>You gain {fpgDelta.toFixed(1)} FPG.</span>
                : <span>You lose {Math.abs(fpgDelta).toFixed(1)} FPG{ageDelta < -2 ? ` but gain ${Math.abs(ageDelta).toFixed(1)} years of youth.` : "."}</span>
              }
              {" "}Proj season delta: <span style={{ color: deltaColor(projDelta) }}>{projDelta > 0 ? "+" : ""}{projDelta.toLocaleString()} FP</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 4: DRAFT CAPITAL
// ============================================================

function DraftCapital() {
  const [simCount, setSimCount] = useState(50000);
  const [simResults, setSimResults] = useState(null);

  const standings = STANDINGS;

  // own picks have no `from` — default to MY_TEAM so the lottery sim resolves their rank correctly
  const myFirsts = (DRAFT_PICKS[MY_TEAM] || [])
    .filter(p => p.round === 1)
    .map(p => ({ ...p, from: p.from || MY_TEAM }));
  const BALLS = { 10: 40, 9: 30, 8: 20, 7: 7, 6: 3 };

  const lotteryTeams = useMemo(() => {
    return standings.filter(s => s.rank >= 6).sort((a, b) => b.rank - a.rank).map(s => ({
      team: s.team, rank: s.rank, balls: BALLS[s.rank] || 0
    }));
  }, []);

  function runSim(N) {
    const myPickTeams = myFirsts.map(p => p.from);
    const perPickResults = myPickTeams.map(() => Array(10).fill(0));
    const bestPickCounts = Array(10).fill(0);
    let bestSum = 0;

    for (let sim = 0; sim < N; sim++) {
      let remaining = lotteryTeams.map(t => ({ ...t, b: t.balls }));
      const results = {};

      for (let pick = 1; pick <= 5; pick++) {
        const totalB = remaining.reduce((s, t) => s + t.b, 0);
        if (totalB === 0) break;
        let draw = Math.random() * totalB;
        let winner = remaining[0];
        for (const t of remaining) {
          draw -= t.b;
          if (draw <= 0) { winner = t; break; }
        }
        results[winner.team] = pick;
        remaining = remaining.filter(t => t.team !== winner.team);
      }

      standings.filter(s => s.rank < 6).forEach(s => {
        results[s.team] = 5 + (6 - s.rank);
      });

      let best = 11;
      myPickTeams.forEach((team, i) => {
        const pick = results[team] || 10;
        perPickResults[i][pick - 1]++;
        if (pick < best) best = pick;
      });
      bestPickCounts[best - 1]++;
      bestSum += best;
    }

    const perPick = myPickTeams.map((team, i) => {
      const dist = perPickResults[i].map(c => (c / N) * 100);
      const ev = dist.reduce((s, p, j) => s + p * (j + 1), 0) / 100;
      const rank = standings.find(s => s.team === team)?.rank || 5;
      return { team, rank, dist, ev: ev.toFixed(2), inLottery: rank >= 6 };
    });

    const bestDist = bestPickCounts.map(c => (c / N) * 100);
    const bestEV = (bestSum / N).toFixed(2);
    const pFirst = bestDist[0];
    const pTop3 = bestDist.slice(0, 3).reduce((a, b) => a + b, 0);
    const pTop5 = bestDist.slice(0, 5).reduce((a, b) => a + b, 0);

    return { perPick, bestDist, bestEV, pFirst, pTop3, pTop5, N };
  }

  useEffect(() => { setSimResults(runSim(simCount)); }, []);

  const doRun = () => setSimResults(runSim(simCount));

  const pickColors = [C.green, C.cyan, C.amber, C.yellow, C.dim, "#444", "#333", "#2a2a2a", "#222", "#1a1a1a"];

  return (
    <div>
      {/* Pick cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {myFirsts.map((pick, i) => {
          const rank = standings.find(s => s.team === pick.from)?.rank || 5;
          const odds = LOTTERY_ODDS[rank] || null;
          return (
            <div key={i} style={styles.card}>
              <div style={styles.label}>2026 RD1 VIA {pick.from.toUpperCase()}</div>
              <div style={{ fontSize: 11, color: C.white, marginBottom: 8 }}>Standing: #{rank} {rank >= 6 ? <span style={{ color: C.red }}>[LOTTERY]</span> : <span style={{ color: C.dim }}>(not lottery)</span>}</div>
              {odds ? (
                <div>
                  <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
                    {odds.map((o, j) => (
                      <div key={j} style={{ flex: Math.max(o, 3), height: 22, background: pickColors[j], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#000" }}>
                        {o >= 10 ? `${o}%` : ""}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.dim }}>
                    <span>#1</span><span>#2</span><span>#3</span><span>#4</span><span>#5</span>
                  </div>
                </div>
              ) : (
                <div style={{ color: C.white, fontSize: 10 }}>Projected pick <span style={{ color: C.cyan, fontWeight: 700 }}>#{5 + (6 - rank)}</span></div>
              )}
              {simResults && <div style={{ marginTop: 6, fontSize: 10, color: C.amber }}>EV: #{simResults.perPick[i]?.ev}</div>}
            </div>
          );
        })}
      </div>

      {/* Monte Carlo Controls + Headlines */}
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={styles.cardTitle}>MONTE CARLO LOTTERY SIM</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select style={styles.select} value={simCount} onChange={e => setSimCount(parseInt(e.target.value))}>
              <option value={10000}>10K sims</option>
              <option value={50000}>50K sims</option>
              <option value={100000}>100K sims</option>
              <option value={500000}>500K sims</option>
            </select>
            <button onClick={doRun} style={{ ...styles.select, cursor: "pointer", background: C.amber, color: "#000", fontWeight: 700, border: "none", padding: "6px 14px" }}>
              RUN
            </button>
          </div>
        </div>

        {simResults && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "P(#1 OVERALL)", value: `${simResults.pFirst.toFixed(1)}%`, color: C.green },
                { label: "P(TOP 3 PICK)", value: `${simResults.pTop3.toFixed(1)}%`, color: C.cyan },
                { label: "P(LOTTERY PICK)", value: `${simResults.pTop5.toFixed(1)}%`, color: C.amber },
                { label: "BEST PICK EV", value: `#${simResults.bestEV}`, color: C.white },
              ].map((s, i) => (
                <div key={i} style={{ background: "#080808", border: `1px solid ${C.dimmer}`, padding: 12 }}>
                  <div style={styles.label}>{s.label}</div>
                  <div style={{ ...styles.bigNum, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Best pick distribution */}
            <div style={{ fontSize: 10, color: C.amber, letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>BEST PICK DISTRIBUTION (YOUR HIGHEST OF {myFirsts.length} FIRSTS)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={simResults.bestDist.map((pct, i) => ({ pick: `#${i + 1}`, pct: parseFloat(pct.toFixed(1)) }))} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <XAxis dataKey="pick" tick={{ fill: C.dim, fontSize: 10, fontFamily: font }} />
                <YAxis tick={{ fill: C.dim, fontSize: 9, fontFamily: font }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.amber}`, fontFamily: font, fontSize: 11, color: C.white }} formatter={(v) => [`${v}%`, "Prob"]} />
                <Bar dataKey="pct">
                  {simResults.bestDist.map((_, i) => (
                    <Cell key={i} fill={i < 3 ? C.green : i < 5 ? C.cyan : C.dim} fillOpacity={i < 5 ? 0.85 : 0.3} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Per-pick EV table */}
            <div style={{ fontSize: 10, color: C.amber, letterSpacing: 1, marginTop: 16, marginBottom: 8, fontWeight: 600 }}>PER-PICK OUTCOME DISTRIBUTION</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Pick (via)</th>
                  <th style={styles.thR}>Standing</th>
                  <th style={styles.thR}>EV</th>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => <th key={n} style={{ ...styles.thR, fontSize: 9 }}>#{n}</th>)}
                </tr>
              </thead>
              <tbody>
                {simResults.perPick.map((pp, i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td, color: C.white, fontWeight: 600, fontSize: 10 }}>{pp.team}</td>
                    <td style={{ ...styles.tdR, color: pp.rank >= 6 ? C.red : C.white }}>#{pp.rank}</td>
                    <td style={{ ...styles.tdR, color: C.amber, fontWeight: 700 }}>{pp.ev}</td>
                    {pp.dist.map((pct, j) => (
                      <td key={j} style={{ ...styles.tdR, fontSize: 10, color: pct > 20 ? C.green : pct > 5 ? C.white : C.dim }}>
                        {pct >= 0.5 ? pct.toFixed(0) : pct > 0 ? "<1" : "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Standings + pick inventory */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>CURRENT STANDINGS</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Team</th>
                <th style={styles.thR}>W-L</th>
                <th style={styles.thR}>FP For</th>
                <th style={styles.th}>Own 1st?</th>
              </tr>
            </thead>
            <tbody>
              {standings.map(s => {
                const isMe = s.team === MY_TEAM;
                const iOwn = myFirsts.some(p => p.from === s.team);
                return (
                  <tr key={s.team} style={isMe ? styles.myTeamRow : {}}>
                    <td style={{ ...styles.td, color: s.rank >= 6 ? C.red : C.white }}>{s.rank}</td>
                    <td style={{ ...styles.td, color: isMe ? C.amber : C.white, fontWeight: isMe ? 700 : 400, fontSize: 10 }}>{s.team}</td>
                    <td style={{ ...styles.tdR, fontSize: 10 }}>{s.w}-{s.l}</td>
                    <td style={{ ...styles.tdR, fontSize: 10 }}>{s.fpFor.toLocaleString()}</td>
                    <td style={styles.td}>
                      {iOwn ? <span style={{ color: C.green, fontWeight: 700 }}>YES</span> : <span style={{ color: C.dim }}>-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>PICK INVENTORY (2026)</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, fontSize: 9 }}>Team</th>
                {[1,2,3,4,5,6,7,8,9,10].map(r => <th key={r} style={{ ...styles.thR, fontSize: 9 }}>R{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(DRAFT_PICKS).map(([team, picks]) => (
                <tr key={team} style={team === MY_TEAM ? styles.myTeamRow : {}}>
                  <td style={{ ...styles.td, color: team === MY_TEAM ? C.amber : C.white, fontWeight: team === MY_TEAM ? 700 : 400, fontSize: 9 }}>{team}</td>
                  {[1,2,3,4,5,6,7,8,9,10].map(r => {
                    const has = picks.filter(p => p.round === r);
                    return (
                      <td key={r} style={{ ...styles.tdR, fontSize: 9 }}>
                        {has.length === 0 ? <span style={{ color: C.dimmer }}>-</span> :
                          has.length === 1 ? <span style={{ color: has[0].from && has[0].from !== team ? C.cyan : C.green }}>*</span> :
                          <span style={{ color: C.cyan }}>{has.length}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 6, fontSize: 8, color: C.dim }}>
            <span style={{ color: C.green }}>*</span> own &nbsp;
            <span style={{ color: C.cyan }}>*</span> acquired
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 5: FREE AGENTS (placeholder)
// ============================================================

function FreeAgents() {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>FREE AGENT SCANNER</div>
      <div style={{ color: C.white, fontSize: 11, lineHeight: 1.8, padding: "20px 0" }}>
        <div style={{ color: C.amber, marginBottom: 12 }}>[ DATA FEED REQUIRED ]</div>
        <div>Free agent data requires a full NBA player pool export from Fantrax.</div>
        <div>The roster CSVs only contain rostered players across the 10 teams.</div>
        <div style={{ marginTop: 12, color: C.cyan }}>To populate this view:</div>
        <div>1. Go to Fantrax &gt; Players &gt; All Available</div>
        <div>2. Export as CSV</div>
        <div>3. Upload here (V2: auto-ingest via Fantrax API)</div>
        <div style={{ marginTop: 20, padding: 16, border: `1px dashed ${C.dimmer}`, textAlign: "center", color: C.dim }}>
          CSV upload not yet implemented. Coming in V2.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================

const TABS = [
  { id: "roster", label: "My Roster", component: MyRoster },
  { id: "league", label: "League", component: LeagueLandscape },
  { id: "trade", label: "Trade Analyzer", component: TradeAnalyzer },
  { id: "draft", label: "Draft Capital", component: DraftCapital },
  { id: "fa", label: "Free Agents", component: FreeAgents },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("roster");
  const ActiveComponent = TABS.find(t => t.id === activeTab).component;

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>THE GHOLA TERMINAL</div>
        </div>
        <div style={{ color: C.dim, fontSize: 10, textAlign: "right" }}>
          <div>DATA AS OF: {DATA._meta?.lastUpdated ? new Date(DATA._meta.lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase() : "UNKNOWN"}</div>
          <div style={{ color: C.amber }}>MODE: TANK</div>
        </div>
      </div>
      <div style={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} style={styles.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={styles.content}>
        <ActiveComponent />
      </div>
    </div>
  );
}
