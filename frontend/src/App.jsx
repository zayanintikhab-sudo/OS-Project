import { useState, useEffect, useRef, useCallback } from "react";

const MAX_READY_WAITING = 5;

const COLORS = {
  NEW:               { bg: "#f8fafc", border: "#94a3b8", text: "#475569", dot: "#94a3b8" },
  READY:             { bg: "#eff6ff", border: "#3b82f6", text: "#1d4ed8", dot: "#3b82f6" },
  RUNNING:           { bg: "#f0fdf4", border: "#16a34a", text: "#15803d", dot: "#16a34a" },
  WAITING:           { bg: "#fffbeb", border: "#d97706", text: "#b45309", dot: "#d97706" },
  TERMINATED:        { bg: "#fef2f2", border: "#dc2626", text: "#b91c1c", dot: "#dc2626" },
  READY_SUSPENDED:   { bg: "#f0f9ff", border: "#0284c7", text: "#075985", dot: "#0284c7" },
  WAITING_SUSPENDED: { bg: "#fefce8", border: "#ca8a04", text: "#92400e", dot: "#ca8a04" },
};

const ALGORITHMS = [
  "FCFS","SJF (Non-Preemptive)","SJF (Preemptive)",
  "Round Robin","Priority (Non-Preemptive)","Priority (Preemptive)","HRRN"
];

const THREAD_PALETTE = [
  "#3b82f6","#16a34a","#d97706","#dc2626","#9333ea",
  "#0891b2","#db2777","#65a30d","#ea580c","#7c3aed"
];

// ─── SCHEDULING ENGINE ────────────────────────────────────────────────────────
function computeSchedule(threads, algorithm, quantum = 2) {
  if (!threads.length) return { timeline: [], results: [] };
  const jobs = threads.map(t => ({
    ...t, remaining: t.bt, startTime: -1, finishTime: 0, waitTime: 0
  }));
  const timeline = [];
  let time = 0;
  const completed = new Set();

  const alive = (j) => !completed.has(j.id) && !j.killed;
  const ready = (t) => jobs.filter(j => alive(j) && j.at <= t);

  if (algorithm === "FCFS") {
    const sorted = [...jobs].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    for (const j of sorted) {
      if (j.killed) continue;
      if (time < j.at) time = j.at;
      timeline.push({ tid: j.id, start: time, end: time + j.bt, priority: j.priority });
      j.startTime = time; j.finishTime = time + j.bt; j.waitTime = j.startTime - j.at;
      time += j.bt; completed.add(j.id);
    }
  } else if (algorithm === "SJF (Non-Preemptive)") {
    while (completed.size + jobs.filter(j => j.killed).length < jobs.length) {
      const r = ready(time).sort((a, b) => a.bt - b.bt || a.at - b.at);
      if (!r.length) { time++; continue; }
      const j = r[0];
      if (j.startTime === -1) j.startTime = time;
      timeline.push({ tid: j.id, start: time, end: time + j.remaining, priority: j.priority });
      time += j.remaining; j.finishTime = time; j.waitTime = j.startTime - j.at;
      j.remaining = 0; completed.add(j.id);
    }
  } else if (algorithm === "SJF (Preemptive)") {
    while (completed.size + jobs.filter(j => j.killed).length < jobs.length) {
      const r = ready(time).sort((a, b) => a.remaining - b.remaining);
      if (!r.length) { time++; continue; }
      const j = r[0];
      if (j.startTime === -1) j.startTime = time;
      j.remaining--;
      timeline.push({ tid: j.id, start: time, end: time + 1, priority: j.priority });
      time++;
      if (j.remaining === 0) { j.finishTime = time; j.waitTime = j.finishTime - j.at - j.bt; completed.add(j.id); }
    }
  } else if (algorithm === "Round Robin") {
    const queue = [], inQueue = new Set();
    let idx = 0;
    const sorted = [...jobs].filter(j => !j.killed).sort((a, b) => a.at - b.at);
    while (completed.size < sorted.length) {
      while (idx < sorted.length && sorted[idx].at <= time) {
        if (!inQueue.has(sorted[idx].id)) { queue.push(sorted[idx]); inQueue.add(sorted[idx].id); }
        idx++;
      }
      if (!queue.length) { time++; continue; }
      const j = queue.shift();
      if (j.startTime === -1) j.startTime = time;
      const exec = Math.min(quantum, j.remaining);
      timeline.push({ tid: j.id, start: time, end: time + exec, priority: j.priority });
      time += exec; j.remaining -= exec;
      while (idx < sorted.length && sorted[idx].at <= time) {
        if (!inQueue.has(sorted[idx].id)) { queue.push(sorted[idx]); inQueue.add(sorted[idx].id); }
        idx++;
      }
      if (j.remaining > 0) queue.push(j);
      else { j.finishTime = time; j.waitTime = j.finishTime - j.at - j.bt; completed.add(j.id); }
    }
  } else if (algorithm === "Priority (Non-Preemptive)") {
    while (completed.size + jobs.filter(j => j.killed).length < jobs.length) {
      const r = ready(time).sort((a, b) => b.priority - a.priority || a.at - b.at);
      if (!r.length) { time++; continue; }
      const j = r[0];
      if (j.startTime === -1) j.startTime = time;
      timeline.push({ tid: j.id, start: time, end: time + j.remaining, priority: j.priority });
      time += j.remaining; j.finishTime = time; j.waitTime = j.startTime - j.at;
      j.remaining = 0; completed.add(j.id);
    }
  } else if (algorithm === "Priority (Preemptive)") {
    while (completed.size + jobs.filter(j => j.killed).length < jobs.length) {
      const r = ready(time).sort((a, b) => b.priority - a.priority);
      if (!r.length) { time++; continue; }
      const j = r[0];
      if (j.startTime === -1) j.startTime = time;
      j.remaining--;
      timeline.push({ tid: j.id, start: time, end: time + 1, priority: j.priority });
      time++;
      if (j.remaining === 0) { j.finishTime = time; j.waitTime = j.finishTime - j.at - j.bt; completed.add(j.id); }
    }
  } else if (algorithm === "HRRN") {
    while (completed.size + jobs.filter(j => j.killed).length < jobs.length) {
      const r = ready(time);
      if (!r.length) { time++; continue; }
      const best = r.reduce((acc, j) => {
        const hr = (time - j.at + j.bt) / j.bt;
        return hr > (time - acc.at + acc.bt) / acc.bt ? j : acc;
      });
      if (best.startTime === -1) best.startTime = time;
      timeline.push({ tid: best.id, start: time, end: time + best.remaining, priority: best.priority });
      time += best.remaining; best.finishTime = time; best.waitTime = best.startTime - best.at;
      best.remaining = 0; completed.add(best.id);
    }
  }

  const merged = [];
  for (const slot of timeline) {
    if (merged.length && merged[merged.length-1].tid === slot.tid && merged[merged.length-1].end === slot.start)
      merged[merged.length-1].end = slot.end;
    else merged.push({ ...slot });
  }

  const results = jobs.filter(j => !j.killed).map(j => ({
    id: j.id, at: j.at, bt: j.bt, priority: j.priority,
    ct: j.finishTime || 0, tat: (j.finishTime || 0) - j.at,
    wt: Math.max(0, j.waitTime || 0),
    rt: j.startTime !== -1 ? j.startTime - j.at : 0,
  }));

  return { timeline: merged, results };
}

// ─── COMPUTE LIVE STATES ──────────────────────────────────────────────────────
function computeLiveStates(t, timeline, threads, suspendedSet) {
  const readyCount = { count: 0 };
  const waitingCount = { count: 0 };

  const rawStates = threads.map(th => {
    if (th.killed) return { ...th, state: "TERMINATED", remaining: 0 };
    const slots = timeline.filter(s => s.tid === th.id);
    const active = slots.find(s => s.start <= t && s.end > t);
    const maxEnd = slots.length ? Math.max(...slots.map(s => s.end)) : 0;
    if (t < th.at) return { ...th, state: "NEW", remaining: th.bt };
    if (active) {
      const consumed = slots.filter(s => s.end <= t).reduce((sum, s) => sum + (s.end - s.start), 0);
      return { ...th, state: "RUNNING", remaining: Math.max(0, th.bt - consumed - (t - active.start)) };
    }
    if (t >= maxEnd && slots.length > 0) return { ...th, state: "TERMINATED", remaining: 0 };
    const consumed = slots.filter(s => s.end <= t).reduce((sum, s) => sum + (s.end - s.start), 0);
    const remaining = Math.max(0, th.bt - consumed);
    if (slots.some(s => s.start > t)) return { ...th, state: "READY", remaining };
    return { ...th, state: "WAITING", remaining };
  });

  return rawStates.map(th => {
    if (th.state === "READY") {
      if (suspendedSet.has(th.id)) return { ...th, state: "READY_SUSPENDED" };
      if (readyCount.count >= MAX_READY_WAITING) return { ...th, state: "READY_SUSPENDED" };
      readyCount.count++;
      return th;
    }
    if (th.state === "WAITING") {
      if (suspendedSet.has(th.id)) return { ...th, state: "WAITING_SUSPENDED" };
      if (waitingCount.count >= MAX_READY_WAITING) return { ...th, state: "WAITING_SUSPENDED" };
      waitingCount.count++;
      return th;
    }
    return th;
  });
}

// ─── GANTT CHART ──────────────────────────────────────────────────────────────
function GanttChart({ timeline, threads, currentTime, maxTime }) {
  if (!timeline.length) return null;
  const end = Math.max(...timeline.map(s => s.end), maxTime || 1);
  const colorMap = {};
  threads.forEach((t, i) => colorMap[t.id] = THREAD_PALETTE[i % THREAD_PALETTE.length]);

  return (
    <div style={{ overflowX: "auto", padding: "4px 0" }}>
      <div style={{ minWidth: 500 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {threads.filter(t => !t.killed).map(t => (
            <span key={t.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colorMap[t.id] }} />
              <span style={{ color: "#475569" }}>{t.id}</span>
            </span>
          ))}
        </div>
        <div style={{ position: "relative", height: 44, background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          {timeline.map((slot, i) => {
            const left = (slot.start / end) * 100;
            const width = ((slot.end - slot.start) / end) * 100;
            const isActive = currentTime >= slot.start && currentTime < slot.end;
            return (
              <div key={i} title={`${slot.tid}: ${slot.start}→${slot.end}`} style={{
                position: "absolute", left: `${left}%`, width: `${Math.max(width, 0.3)}%`,
                top: 4, height: 36,
                background: colorMap[slot.tid] || "#888",
                opacity: isActive ? 0.95 : 0.45,
                borderRadius: 3,
                border: isActive ? `2px solid rgba(0,0,0,0.25)` : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: "#fff",
                overflow: "hidden",
                transition: "opacity 0.3s",
                boxSizing: "border-box",
              }}>
                {width > 3 ? slot.tid : ""}
              </div>
            );
          })}
          {currentTime > 0 && currentTime <= end && (
            <div style={{ position: "absolute", left: `${(currentTime/end)*100}%`, top: 0, height: "100%", width: 2, background: "#1e293b", opacity: 0.6 }} />
          )}
        </div>
        <div style={{ position: "relative", height: 18, marginTop: 2 }}>
          {[0, .25, .5, .75, 1].map(f => (
            <span key={f} style={{ position: "absolute", left: `${f*100}%`, transform: "translateX(-50%)", fontSize: 10, color: "#94a3b8" }}>
              {Math.round(f * end)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── THREAD CARD ──────────────────────────────────────────────────────────────
function ThreadCard({ thread, onKill, onPriorityChange, colorMap, prevState }) {
  const c = COLORS[thread.state] || COLORS.NEW;
  const isTransitioning = prevState && prevState !== thread.state;
  const stateIcons = {
    NEW: "⬡", READY: "◈", RUNNING: "▶", WAITING: "⏸",
    TERMINATED: "■", READY_SUSPENDED: "⊘", WAITING_SUSPENDED: "⊙"
  };

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 8,
      padding: "9px 11px",
      minWidth: 160,
      maxWidth: 190,
      position: "relative",
      overflow: "hidden",
      boxShadow: thread.state === "RUNNING" ? `0 2px 8px ${c.border}40` : "none",
      transition: "all 0.4s cubic-bezier(0.4,0,0.2,1)",
      transform: isTransitioning ? "scale(1.04)" : "scale(1)",
      opacity: thread.state === "TERMINATED" ? 0.55 : 1,
    }}>
      {isTransitioning && (
        <div style={{
          position: "absolute", inset: 0, background: c.border, opacity: 0.08,
          borderRadius: 8, pointerEvents: "none",
          animation: "stateFlash 0.4s ease-out forwards"
        }} />
      )}
      {thread.state === "RUNNING" && (
        <div style={{
          position: "absolute", top: 0, left: 0, height: 2, background: c.border,
          animation: "runPulse 1.2s ease-in-out infinite", borderRadius: "8px 8px 0 0"
        }} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: c.text, fontFamily: "monospace" }}>{thread.id}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: c.text, background: `${c.border}18`, padding: "1px 5px", borderRadius: 8, border: `1px solid ${c.border}44`, whiteSpace: "nowrap" }}>
            {stateIcons[thread.state]} {thread.state.replace("_", " ")}
          </span>
          {thread.state !== "TERMINATED" && onKill && (
            <button onClick={() => onKill(thread.id)} title="Kill thread" style={{
              background: "transparent", color: "#dc2626", border: "none",
              fontSize: 13, padding: 0, lineHeight: 1, cursor: "pointer", opacity: 0.65
            }}>✕</button>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 6px", fontSize: 10, color: "#94a3b8" }}>
        <span>AT:<b style={{ color: "#475569", marginLeft: 3 }}>{thread.at}</b></span>
        <span>BT:<b style={{ color: "#475569", marginLeft: 3 }}>{thread.bt}</b></span>
        <span>Rem:<b style={{ color: c.text, marginLeft: 3 }}>{thread.remaining}</b></span>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          P:
          {onPriorityChange ? (
            <select value={thread.priority}
              onChange={e => onPriorityChange(thread.id, parseInt(e.target.value))}
              style={{
                background: "#fff", border: `1px solid ${c.border}55`,
                color: "#b45309", fontSize: 10, borderRadius: 3, padding: "0 2px",
                cursor: "pointer", width: "auto", minWidth: 28, fontFamily: "inherit"
              }}>
              {[1,2,3,4,5,6,7,8,9,10].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <b style={{ color: "#b45309", marginLeft: 2 }}>{thread.priority}</b>
          )}
        </span>
      </div>
      {thread.state === "RUNNING" && (
        <div style={{ marginTop: 5, height: 2, background: "#e2e8f0", borderRadius: 1, overflow: "hidden" }}>
          <div style={{
            height: "100%", background: c.border,
            width: `${thread.bt > 0 ? ((thread.bt - thread.remaining) / thread.bt) * 100 : 0}%`,
            transition: "width 0.6s ease", borderRadius: 1
          }} />
        </div>
      )}
      {colorMap && colorMap[thread.id] && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: colorMap[thread.id], opacity: 0.5, borderRadius: "0 0 8px 8px" }} />
      )}
    </div>
  );
}

// ─── STATE LANE ───────────────────────────────────────────────────────────────
function StateLane({ state, threads, onKill, onPriorityChange, colorMap, prevStates }) {
  const c = COLORS[state] || COLORS.NEW;
  const stateLabel = state.replace(/_/g, " ");
  const isSuspend = state.includes("SUSPENDED");
  const count = threads.length;
  const atCap = (state === "READY" || state === "WAITING") && count >= MAX_READY_WAITING;

  return (
    <div style={{
      background: isSuspend ? "#fafbfc" : "#fff",
      border: `1px solid ${c.border}${isSuspend ? "33" : "55"}`,
      borderLeft: `3px solid ${c.border}${isSuspend ? "66" : "cc"}`,
      borderRadius: 8, padding: "8px 12px",
      transition: "border-color 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: count ? 8 : 0 }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", background: c.dot,
          boxShadow: count > 0 ? `0 0 5px ${c.dot}55` : "none",
          transition: "box-shadow 0.3s"
        }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: c.text, letterSpacing: "0.08em" }}>
          {stateLabel}
        </span>
        {isSuspend && (
          <span style={{ fontSize: 9, color: c.text, background: `${c.border}15`, padding: "1px 5px", borderRadius: 6, border: `1px solid ${c.border}33` }}>
            SUSPENDED
          </span>
        )}
        <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          {(state === "READY" || state === "WAITING") && (
            <span style={{ fontSize: 9, color: atCap ? "#dc2626" : "#94a3b8" }}>
              {count}/{MAX_READY_WAITING}
            </span>
          )}
          <span style={{ color: count > 0 ? "#64748b" : "#cbd5e1" }}>
            {count} thread{count !== 1 ? "s" : ""}
          </span>
        </span>
      </div>
      {count > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, animation: "fadeIn 0.25s ease" }}>
          {threads.map(t => (
            <ThreadCard
              key={t.id} thread={t}
              onKill={onKill}
              onPriorityChange={onPriorityChange}
              colorMap={colorMap}
              prevState={prevStates?.[t.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ADD THREAD PANEL ─────────────────────────────────────────────────────────
function AddThreadPanel({ onAdd, nextId }) {
  const [form, setForm] = useState({ id: nextId, at: 0, bt: 3, priority: 1 });
  useEffect(() => setForm(f => ({ ...f, id: nextId })), [nextId]);

  const submit = () => {
    if (!form.id.trim()) return;
    onAdd({ id: form.id.trim(), at: parseInt(form.at)||0, bt: Math.max(1, parseInt(form.bt)||1), priority: parseInt(form.priority)||1 });
    setForm(f => ({ ...f, id: "" }));
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Thread ID</label>
          <input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
            placeholder="T1" style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Arrival</label>
          <input type="number" min={0} value={form.at} onChange={e => setForm(f => ({ ...f, at: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Burst</label>
          <input type="number" min={1} value={form.bt} onChange={e => setForm(f => ({ ...f, bt: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Priority (1–10)</label>
          <input type="number" min={1} max={10} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inputStyle} />
        </div>
      </div>
      <button onClick={submit} disabled={!form.id.trim()} style={{
        marginTop: 8, width: "100%",
        background: form.id.trim() ? "#1d4ed8" : "#e2e8f0",
        color: form.id.trim() ? "#fff" : "#94a3b8",
        borderRadius: 6, border: "none",
        padding: "7px 0", fontSize: 11, fontWeight: 700,
        cursor: form.id.trim() ? "pointer" : "not-allowed",
        transition: "all 0.15s"
      }}>
        + Add Thread
      </button>
    </div>
  );
}

const inputStyle = {
  background: "#fff", border: "1px solid #d1d9e3", color: "#1e293b",
  borderRadius: 5, padding: "5px 8px", fontSize: 11, width: "100%",
  boxSizing: "border-box", fontFamily: "inherit",
};

const panelStyle = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12
};

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", marginBottom: 9, letterSpacing: "0.1em" }}>
      {children}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [threads, setThreads] = useState([]);
  const [algorithm, setAlgorithm] = useState("Round Robin");
  const [quantum, setQuantum] = useState(2);
  const [speed, setSpeed] = useState(600);

  const [simState, setSimState] = useState("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [schedule, setSchedule] = useState({ timeline: [], results: [] });
  const [liveThreads, setLiveThreads] = useState([]);
  const [prevStates, setPrevStates] = useState({});
  const [log, setLog] = useState([]);
  const [tab, setTab] = useState("sim");
  const [suspendedSet, setSuspendedSet] = useState(new Set());

  const timerRef = useRef(null);
  const timeRef = useRef(0);
  const schedRef = useRef({ timeline: [], results: [] });
  const threadsRef = useRef([]);
  const suspendRef = useRef(new Set());
  const logRef = useRef(null);

  useEffect(() => { threadsRef.current = threads; }, [threads]);
  useEffect(() => { suspendRef.current = suspendedSet; }, [suspendedSet]);

  const colorMap = {};
  threads.forEach((t, i) => colorMap[t.id] = THREAD_PALETTE[i % THREAD_PALETTE.length]);

  const nextId = `T${threads.length + 1}`;

  const buildLive = useCallback((t, tl, ths, susp) => computeLiveStates(t, tl, ths, susp), []);

  const recompute = useCallback((ths, algo, q) => {
    const sched = computeSchedule(ths, algo, q);
    setSchedule(sched); schedRef.current = sched; return sched;
  }, []);

  const addLog = (t, msg, type) => setLog(prev => [...prev.slice(-80), { t, msg, type }]);

  const addThread = useCallback((newThread) => {
    if (threads.find(t => t.id === newThread.id)) { alert("Duplicate Thread ID"); return; }
    const updated = [...threads, newThread];
    setThreads(updated); threadsRef.current = updated;
    if (simState === "running" || simState === "paused") {
      const sched = recompute(updated, algorithm, quantum);
      const live = buildLive(timeRef.current, sched.timeline, updated, suspendRef.current);
      setLiveThreads(live);
      addLog(timeRef.current, `+ ${newThread.id} added on-the-fly (AT:${newThread.at} BT:${newThread.bt} P:${newThread.priority})`, "info");
    }
  }, [threads, simState, algorithm, quantum, recompute, buildLive]);

  const killThread = useCallback((id) => {
    const updated = threads.map(t => t.id === id ? { ...t, killed: true } : t);
    setThreads(updated); threadsRef.current = updated;
    if (simState === "running" || simState === "paused") {
      const sched = recompute(updated, algorithm, quantum);
      const live = buildLive(timeRef.current, sched.timeline, updated, suspendRef.current);
      setLiveThreads(live);
    }
    addLog(timeRef.current, `killed ${id}`, "done");
  }, [threads, simState, algorithm, quantum, recompute, buildLive]);

  const changePriority = useCallback((id, newPriority) => {
    const updated = threads.map(t => t.id === id ? { ...t, priority: newPriority } : t);
    setThreads(updated); threadsRef.current = updated;
    if (simState === "running" || simState === "paused") {
      const sched = recompute(updated, algorithm, quantum);
      const live = buildLive(timeRef.current, sched.timeline, updated, suspendRef.current);
      setLiveThreads(live);
      addLog(timeRef.current, `${id} priority -> ${newPriority}`, "switch");
    }
  }, [threads, simState, algorithm, quantum, recompute, buildLive]);

  const startSim = () => {
    if (!threads.filter(t => !t.killed).length) return;
    clearInterval(timerRef.current);
    const sched = recompute(threads, algorithm, quantum);
    timeRef.current = 0; setCurrentTime(0);
    setLiveThreads(buildLive(0, sched.timeline, threads, suspendRef.current));
    setLog([{ t: 0, msg: `Simulation started — ${algorithm}`, type: "info" }]);
    setPrevStates({}); setSimState("running"); setTab("sim");
  };

  const togglePause = () => {
    setSimState(s => {
      const next = s === "running" ? "paused" : "running";
      if (next === "paused") { clearInterval(timerRef.current); addLog(timeRef.current, "Simulation paused", "info"); }
      else { addLog(timeRef.current, "Simulation resumed", "info"); }
      return next;
    });
  };

  const reset = () => {
    clearInterval(timerRef.current);
    setSimState("idle"); setCurrentTime(0); timeRef.current = 0;
    setLiveThreads([]); setLog([]); setSchedule({ timeline: [], results: [] });
    setPrevStates({}); setSuspendedSet(new Set());
  };

  useEffect(() => {
    if (simState !== "running") { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      const { timeline } = schedRef.current;
      const maxTime = timeline.length ? Math.max(...timeline.map(s => s.end)) : 0;
      timeRef.current += 1;
      const t = timeRef.current;
      setCurrentTime(t);
      const newLive = buildLive(t, timeline, threadsRef.current, suspendRef.current);
      setLiveThreads(prev => {
        const prevMap = {};
        prev.forEach(p => prevMap[p.id] = p.state);
        const transitions = {};
        newLive.forEach(th => { if (prevMap[th.id] && prevMap[th.id] !== th.state) transitions[th.id] = prevMap[th.id]; });
        setPrevStates(transitions);
        return newLive;
      });
      const prevSlot = timeline.find(s => s.start <= t-1 && s.end > t-1);
      const currSlot = timeline.find(s => s.start <= t && s.end > t);
      if (prevSlot && currSlot && prevSlot.tid !== currSlot.tid)
        setLog(lg => [...lg.slice(-80), { t, msg: `Context switch: ${prevSlot.tid} → ${currSlot.tid}`, type: "switch" }]);
      const starting = timeline.find(s => s.start === t);
      if (starting) setLog(lg => [...lg.slice(-80), { t, msg: `${starting.tid} entered RUNNING`, type: "run" }]);
      const ending = timeline.find(s => s.end === t);
      if (ending && !timeline.some(s => s.tid === ending.tid && s.end > t))
        setLog(lg => [...lg.slice(-80), { t, msg: `${ending.tid} TERMINATED`, type: "done" }]);
      if (t >= maxTime) {
        clearInterval(timerRef.current); setSimState("done");
        setLog(lg => [...lg.slice(-80), { t: maxTime, msg: "Simulation complete", type: "info" }]);
      }
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [simState, speed, buildLive]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const ALL_STATES = ["NEW","READY","RUNNING","WAITING","READY_SUSPENDED","WAITING_SUSPENDED","TERMINATED"];
  const stateGroups = {};
  ALL_STATES.forEach(s => stateGroups[s] = []);
  liveThreads.forEach(t => stateGroups[t.state]?.push(t));

  const maxTime = schedule.timeline.length ? Math.max(...schedule.timeline.map(s => s.end)) : 0;
  const avgWT  = schedule.results.length ? (schedule.results.reduce((s,r) => s+r.wt, 0) / schedule.results.length).toFixed(2) : "-";
  const avgTAT = schedule.results.length ? (schedule.results.reduce((s,r) => s+r.tat, 0) / schedule.results.length).toFixed(2) : "-";
  const cpuUtil = maxTime > 0 ? ((schedule.timeline.reduce((s,sl) => s+(sl.end-sl.start), 0) / maxTime)*100).toFixed(1) : "-";
  const logColors = { info:"#3b82f6", switch:"#d97706", run:"#16a34a", done:"#9333ea" };

  const btnBase = { borderRadius:6, border:"none", padding:"8px 0", fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.15s", width:"100%" };

  return (
    <div style={{ fontFamily:"'JetBrains Mono','Fira Code',monospace", background:"#f0f2f5", minHeight:"100vh", color:"#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.85}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
        @keyframes stateFlash{0%{opacity:.15}100%{opacity:0}}
        @keyframes runPulse{0%{width:0%;opacity:1}50%{width:100%;opacity:.6}100%{width:0%;opacity:1}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#e8ecf0}
        ::-webkit-scrollbar-thumb{background:#c0c8d4;border-radius:2px}
        select option{background:#fff;color:#1e293b}
        input[type=range]{width:100%;height:3px;accent-color:#3b82f6}
      `}</style>

      {/* HEADER */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"12px 20px", display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:30, height:30, background:"linear-gradient(135deg,#3b82f6,#0891b2)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>⚙</div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"#0f172a", letterSpacing:"0.05em" }}>THREAD SCHEDULER MONITOR</div>
          <div style={{ fontSize:9, color:"#94a3b8", letterSpacing:"0.1em" }}>OS PROCESS VISUALIZATION ENGINE</div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <span style={{
            fontSize:10, padding:"3px 9px", border:"1px solid #e2e8f0", borderRadius:4,
            background: simState==="running"?"#f0fdf4":simState==="paused"?"#fffbeb":simState==="done"?"#eff6ff":"#f8fafc",
            color: simState==="running"?"#15803d":simState==="paused"?"#b45309":simState==="done"?"#1d4ed8":"#64748b"
          }}>
            {simState==="running"?"● RUNNING":simState==="paused"?"⏸ PAUSED":simState==="done"?"◼ DONE":"○ IDLE"}
          </span>
          {simState !== "idle" && (
            <span style={{ fontSize:10, color:"#64748b", padding:"3px 9px", border:"1px solid #e2e8f0", borderRadius:4, background:"#f8fafc" }}>
              T = <b style={{ color:"#1d4ed8" }}>{currentTime}</b>
            </span>
          )}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", minHeight:"calc(100vh - 54px)" }}>

        {/* SIDEBAR */}
        <div style={{ background:"#fff", borderRight:"1px solid #e2e8f0", padding:14, display:"flex", flexDirection:"column", gap:12, overflowY:"auto" }}>

          <div style={panelStyle}>
            <SectionHeader>{simState !== "idle" ? "+ ADD ON-THE-FLY" : "+ ADD THREAD"}</SectionHeader>
            <AddThreadPanel onAdd={addThread} nextId={nextId} />
            {simState !== "idle" && (
              <div style={{ fontSize:9, color:"#15803d", marginTop:4, padding:"3px 6px", background:"#f0fdf4", borderRadius:4, border:"1px solid #bbf7d0" }}>
                Live injection — will preempt if higher priority
              </div>
            )}
          </div>

          <div style={panelStyle}>
            <SectionHeader>QUEUE ({threads.filter(t => !t.killed).length})</SectionHeader>
            <div style={{ maxHeight:180, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
              {threads.length === 0 && <div style={{ fontSize:10, color:"#cbd5e1", textAlign:"center", padding:10 }}>No threads yet</div>}
              {threads.map((t) => (
                <div key={t.id} style={{
                  display:"flex", alignItems:"center",
                  background: t.killed ? "#fafafa" : "#f8fafc",
                  borderRadius:5, padding:"5px 8px",
                  border:`1px solid ${t.killed ? "#f1f5f9" : "#e2e8f0"}`,
                  opacity: t.killed ? 0.4 : 1,
                  animation:"slideIn 0.2s ease"
                }}>
                  <div style={{ width:6, height:6, borderRadius:1, background: t.killed ? "#cbd5e1" : colorMap[t.id], marginRight:7, flexShrink:0 }} />
                  <span style={{ flex:1, fontSize:11, fontWeight:700, color: t.killed ? "#94a3b8" : "#1d4ed8" }}>{t.id}</span>
                  <span style={{ fontSize:9, color:"#94a3b8" }}>AT:{t.at} BT:{t.bt} P:{t.priority}</span>
                  {!t.killed && simState === "idle" && (
                    <button onClick={() => setThreads(prev => prev.filter(x => x.id !== t.id))}
                      style={{ marginLeft:6, background:"transparent", color:"#dc2626", border:"none", fontSize:12, padding:0, cursor:"pointer" }}>×</button>
                  )}
                  {t.killed && <span style={{ marginLeft:6, fontSize:9, color:"#dc2626" }}>KILLED</span>}
                </div>
              ))}
            </div>
          </div>

          <div style={panelStyle}>
            <SectionHeader>ALGORITHM</SectionHeader>
            <select value={algorithm} onChange={e => setAlgorithm(e.target.value)}
              disabled={simState === "running"}
              style={{ ...inputStyle, marginBottom:8 }}>
              {ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {algorithm === "Round Robin" && (
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, color:"#64748b", marginBottom:3 }}>Quantum: {quantum}</div>
                <input type="range" min={1} max={8} value={quantum}
                  onChange={e => setQuantum(+e.target.value)}
                  disabled={simState === "running"} />
              </div>
            )}
            <div>
              <div style={{ fontSize:10, color:"#64748b", marginBottom:3 }}>Speed: {(1000/speed).toFixed(1)}×</div>
              <input type="range" min={100} max={1500} step={100} value={speed}
                onChange={e => setSpeed(+e.target.value)} />
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <button onClick={startSim}
              disabled={!threads.filter(t=>!t.killed).length || simState === "running"}
              style={{ ...btnBase, background:(simState==="idle"||simState==="done")?"#15803d":"#e2e8f0", color:(simState==="idle"||simState==="done")?"#fff":"#94a3b8" }}>
              ▶ {simState === "done" ? "Restart" : "Start Simulation"}
            </button>
            {(simState === "running" || simState === "paused") && (
              <button onClick={togglePause} style={{
                ...btnBase,
                background: simState === "paused" ? "#fef3c7" : "#eff6ff",
                color: simState === "paused" ? "#b45309" : "#1d4ed8",
                border: `1px solid ${simState==="paused" ? "#fde68a" : "#bfdbfe"}`
              }}>
                {simState === "paused" ? "▶ Resume" : "⏸ Pause"}
              </button>
            )}
            <button onClick={reset} style={{ ...btnBase, background:"#f8fafc", color:"#64748b", border:"1px solid #e2e8f0" }}>
              ⏹ Reset
            </button>
          </div>

          <div style={{ ...panelStyle, padding:"8px 10px", background:"#f8fafc" }}>
            <div style={{ fontSize:9, color:"#94a3b8", lineHeight:1.8 }}>
              <span style={{ color:"#0284c7" }}>■ READY SUSPENDED</span> — overflow from ready queue (cap: {MAX_READY_WAITING})<br/>
              <span style={{ color:"#ca8a04" }}>■ WAIT SUSPENDED</span> — overflow from waiting queue (cap: {MAX_READY_WAITING})
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div style={{ padding:14, display:"flex", flexDirection:"column", gap:10, overflowY:"auto", background:"#f0f2f5" }}>

          {simState !== "idle" && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
              {[
                { label:"CPU UTIL", value:`${cpuUtil}%`, color:"#15803d", bg:"#f0fdf4", border:"#bbf7d0" },
                { label:"AVG WAIT", value:avgWT,          color:"#b45309", bg:"#fffbeb", border:"#fde68a" },
                { label:"AVG TAT",  value:avgTAT,         color:"#1d4ed8", bg:"#eff6ff", border:"#bfdbfe" },
                { label:"THREADS",  value:threads.filter(t=>!t.killed).length, color:"#7c3aed", bg:"#faf5ff", border:"#e9d5ff" },
              ].map(s => (
                <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:7, padding:"8px 10px" }}>
                  <div style={{ fontSize:8, color:"#94a3b8", letterSpacing:"0.1em", marginBottom:3 }}>{s.label}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:"flex", gap:3, borderBottom:"1px solid #e2e8f0" }}>
            {[["sim","Simulation"],["gantt","Gantt"],["results","Results"]].map(([id,label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                background: tab===id ? "#fff" : "transparent",
                color: tab===id ? "#1d4ed8" : "#64748b",
                border: tab===id ? "1px solid #e2e8f0" : "1px solid transparent",
                borderBottom: tab===id ? "1px solid #fff" : "none",
                borderRadius:"6px 6px 0 0", marginBottom:-1,
                padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer"
              }}>{label}</button>
            ))}
          </div>

          {/* SIM TAB */}
          {tab === "sim" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {["NEW","READY","RUNNING","WAITING","TERMINATED"].map(state => (
                <StateLane
                  key={state} state={state}
                  threads={stateGroups[state] || []}
                  onKill={state !== "TERMINATED" ? killThread : null}
                  onPriorityChange={state !== "TERMINATED" ? changePriority : null}
                  colorMap={colorMap}
                  prevStates={prevStates}
                />
              ))}
              {(stateGroups.READY_SUSPENDED?.length > 0 || stateGroups.WAITING_SUSPENDED?.length > 0) && (
                <div style={{ borderTop:"1px dashed #e2e8f0", paddingTop:8 }}>
                  <div style={{ fontSize:9, color:"#94a3b8", marginBottom:6, letterSpacing:"0.1em" }}>
                    SUSPENDED QUEUES (overflow — max {MAX_READY_WAITING} per active queue)
                  </div>
                  {["READY_SUSPENDED","WAITING_SUSPENDED"].map(state => (
                    stateGroups[state]?.length > 0 && (
                      <StateLane
                        key={state} state={state}
                        threads={stateGroups[state]}
                        onKill={killThread}
                        onPriorityChange={changePriority}
                        colorMap={colorMap}
                        prevStates={prevStates}
                      />
                    )
                  ))}
                </div>
              )}
              <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:7, padding:"8px 12px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#3b82f6", marginBottom:6, letterSpacing:"0.08em" }}>EXECUTION LOG</div>
                <div ref={logRef} style={{ maxHeight:130, overflowY:"auto", display:"flex", flexDirection:"column", gap:2 }}>
                  {log.length === 0 && <div style={{ fontSize:10, color:"#cbd5e1" }}>Awaiting simulation...</div>}
                  {log.map((l, i) => (
                    <div key={i} style={{ fontSize:10, color:logColors[l.type]||"#3b82f6", display:"flex", gap:8, animation:"fadeIn 0.15s ease" }}>
                      <span style={{ color:"#cbd5e1", minWidth:22 }}>[{l.t}]</span>
                      <span>{l.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* GANTT TAB */}
          {tab === "gantt" && (
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:7, padding:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#3b82f6", marginBottom:14, letterSpacing:"0.08em" }}>
                GANTT CHART — {algorithm}
              </div>
              {!schedule.timeline.length ? (
                <div style={{ fontSize:11, color:"#cbd5e1", textAlign:"center", padding:30 }}>Run simulation to see Gantt chart</div>
              ) : (
                <>
                  <GanttChart timeline={schedule.timeline} threads={threads} currentTime={currentTime} maxTime={maxTime} />
                  <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:5 }}>
                    {threads.filter(t => !t.killed).map((th) => {
                      const col = colorMap[th.id];
                      const thSlots = schedule.timeline.filter(s => s.tid === th.id);
                      return (
                        <div key={th.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:col, minWidth:32 }}>{th.id}</span>
                          <div style={{ flex:1, height:22, background:"#f8fafc", borderRadius:3, position:"relative", overflow:"hidden", border:"1px solid #e2e8f0" }}>
                            {thSlots.map((s, i) => (
                              <div key={i} title={`${s.start}→${s.end}`} style={{
                                position:"absolute",
                                left:`${(s.start/maxTime)*100}%`,
                                width:`${Math.max(((s.end-s.start)/maxTime)*100, 0.3)}%`,
                                top:2, height:18, background:col, opacity:0.7,
                                borderRadius:2, display:"flex", alignItems:"center", justifyContent:"center",
                                fontSize:8, color:"#fff", fontWeight:700,
                              }}>
                                {((s.end-s.start)/maxTime) > 0.05 ? `${s.start}-${s.end}` : ""}
                              </div>
                            ))}
                            {currentTime > 0 && (
                              <div style={{ position:"absolute", left:`${(currentTime/maxTime)*100}%`, top:0, height:"100%", width:1, background:"#1e293b", opacity:0.35 }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* RESULTS TAB */}
          {tab === "results" && (
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:7, padding:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#3b82f6", marginBottom:14, letterSpacing:"0.08em" }}>
                RESULTS — {algorithm}
              </div>
              {!schedule.results.length ? (
                <div style={{ fontSize:11, color:"#cbd5e1", textAlign:"center", padding:30 }}>Run simulation to see results</div>
              ) : (
                <>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid #e2e8f0" }}>
                          {["Thread","AT","BT","P","CT","TAT","WT","RT"].map(h => (
                            <th key={h} style={{ padding:"5px 8px", textAlign:"left", fontSize:9, color:"#94a3b8", letterSpacing:"0.08em", fontWeight:700 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.results.sort((a,b) => a.id.localeCompare(b.id)).map((r,i) => (
                          <tr key={r.id} style={{ borderBottom:"1px solid #f1f5f9", background: i%2 ? "#f8fafc" : "#fff" }}>
                            <td style={{ padding:"6px 8px", color:colorMap[r.id]||"#3b82f6", fontWeight:700 }}>{r.id}</td>
                            <td style={{ padding:"6px 8px", color:"#475569" }}>{r.at}</td>
                            <td style={{ padding:"6px 8px", color:"#475569" }}>{r.bt}</td>
                            <td style={{ padding:"6px 8px", color:"#d97706" }}>{r.priority}</td>
                            <td style={{ padding:"6px 8px", color:"#15803d" }}>{r.ct}</td>
                            <td style={{ padding:"6px 8px", color:"#1d4ed8" }}>{r.tat}</td>
                            <td style={{ padding:"6px 8px", color:"#7c3aed" }}>{r.wt}</td>
                            <td style={{ padding:"6px 8px", color:"#0891b2" }}>{r.rt}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop:"1px solid #e2e8f0", background:"#f8fafc" }}>
                          <td colSpan={5} style={{ padding:"6px 8px", fontSize:9, color:"#94a3b8" }}>AVERAGES</td>
                          <td style={{ padding:"6px 8px", color:"#1d4ed8", fontWeight:700 }}>{avgTAT}</td>
                          <td style={{ padding:"6px 8px", color:"#7c3aed", fontWeight:700 }}>{avgWT}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    {[{key:"wt",label:"WAITING TIME",color:"#9333ea"},{key:"tat",label:"TURNAROUND",color:"#1d4ed8"}].map(({key,label,color}) => {
                      const max = Math.max(...schedule.results.map(r => r[key]), 1);
                      return (
                        <div key={key} style={{ background:"#f8fafc", borderRadius:6, padding:10, border:"1px solid #e2e8f0" }}>
                          <div style={{ fontSize:9, color:"#94a3b8", marginBottom:7, letterSpacing:"0.08em" }}>{label}</div>
                          {schedule.results.sort((a,b) => a.id.localeCompare(b.id)).map(r => (
                            <div key={r.id} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                              <span style={{ fontSize:9, color:colorMap[r.id]||color, minWidth:26 }}>{r.id}</span>
                              <div style={{ flex:1, height:12, background:"#e2e8f0", borderRadius:2, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${(r[key]/max)*100}%`, background:color, borderRadius:2, opacity:0.65, transition:"width 0.5s" }} />
                              </div>
                              <span style={{ fontSize:9, color:"#94a3b8", minWidth:14, textAlign:"right" }}>{r[key]}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop:10, padding:10, background:"#f8fafc", borderRadius:6, border:"1px solid #e2e8f0" }}>
                    <div style={{ fontSize:9, color:"#94a3b8", marginBottom:4, letterSpacing:"0.08em" }}>ALGORITHM</div>
                    <div style={{ fontSize:10, color:"#64748b", lineHeight:1.7 }}>
                      {algorithm === "FCFS" && "First Come First Served — simple, non-preemptive. No starvation but bad for short jobs."}
                      {algorithm === "SJF (Non-Preemptive)" && "Shortest Job First — optimal avg wait time. May cause starvation of long processes."}
                      {algorithm === "SJF (Preemptive)" && "Preemptive SRTF — best avg wait time. Higher context switch overhead."}
                      {algorithm === "Round Robin" && `Round Robin (q=${quantum}) — fair time-sharing. Performance depends on quantum.`}
                      {algorithm === "Priority (Non-Preemptive)" && "Priority — higher priority first. Low priority threads may starve."}
                      {algorithm === "Priority (Preemptive)" && "Preemptive Priority — immediately preempts on higher priority arrival."}
                      {algorithm === "HRRN" && "Highest Response Ratio Next — aging prevents starvation. Balances short and long."}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}