import { useState, useEffect, useRef, useCallback } from "react";

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
// Replace these two values with your own from Supabase → Project Settings → API
const SUPABASE_URL = "https://xbxdwogccyzfpbvjzxeo.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhieGR3b2djY3l6ZnBidmp6eGVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNTc0NDUsImV4cCI6MjA5MTkzMzQ0NX0.hK5sh9qL31-hSRxK0h6NJ-MQISodx8Wf59knAzV7N94";

// Helper: raw Supabase REST + Auth calls (no SDK needed)
const sb = {
  headers: () => ({
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  }),
  authHeaders: (token) => ({
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  }),

  // Sign up with username (stored as email = username@awesum.game)
  async signUp(username, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: sb.headers(),
      body: JSON.stringify({
        email: `${username.toLowerCase()}@awesum.com`,
        password,
        data: { username },
      }),
    });
    return res.json();
  },

  // Sign in
  async signIn(username, password) {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: sb.headers(),
        body: JSON.stringify({
          email: `${username.toLowerCase()}@awesum.com`,
          password,
        }),
      },
    );
    return res.json();
  },

  // Upsert score (keeps personal best)
  async upsertScore(token, userId, username, correct, timeMs, composite) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
      method: "POST",
      headers: {
        ...sb.authHeaders(token),
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        user_id: userId,
        username,
        correct_answers: correct,
        time_ms: timeMs,
        composite_score: composite,
        played_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  },

  // Fetch top 20 leaderboard
  async getLeaderboard() {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scores?select=username,correct_answers,time_ms,composite_score,played_at&order=composite_score.desc&limit=20`,
      { headers: sb.headers() },
    );
    return res.ok ? res.json() : [];
  },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const MAX_LIVES = 3;
const PHASES = {
  LOGIN: "login",
  IDLE: "idle",
  PLAYING: "playing",
  OVER: "over",
  BOARD: "board",
};

function generateQuestion() {
  const a = Math.floor(Math.random() * 50) + 1;
  const b = Math.floor(Math.random() * 50) + 1;
  return { a, b, answer: a + b };
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  const cs = Math.floor((ms % 1000) / 10)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}.${cs}`;
}

function calcComposite(correct, ms) {
  return Math.floor((correct * correct * 1000) / (ms / 1000 + 1));
}

// ─── LOGO SVG ─────────────────────────────────────────────────────────────────
function AweSumLogo({ size = 48 }) {
  return (
    <svg
      width={size * 3.2}
      height={size * 0.9}
      viewBox="0 0 192 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="44"
        fontFamily="'Arial Black', Arial, sans-serif"
        fontWeight="900"
        fontSize="46"
        fill="white"
      >
        awe
      </text>
      <text
        x="108"
        y="44"
        fontFamily="'Arial Black', Arial, sans-serif"
        fontWeight="900"
        fontSize="46"
        fill="#FF3333"
      >
        Sum
      </text>
    </svg>
  );
}

// ─── BURST ANIMATION ──────────────────────────────────────────────────────────
function CorrectBurst({ origin }) {
  if (!origin) return null;
  const colors = [
    "#FF3333",
    "#ff6b6b",
    "#ffffff",
    "#ffd60a",
    "#FF3333",
    "#ffffff",
  ];
  return Array.from({ length: 16 }, (_, i) => (
    <div
      key={i}
      style={{
        position: "fixed",
        left: origin.x,
        top: origin.y,
        width: 6 + (i % 3) * 3,
        height: 6 + (i % 3) * 3,
        borderRadius: "50%",
        background: colors[i % colors.length],
        boxShadow: `0 0 8px ${colors[i % colors.length]}`,
        pointerEvents: "none",
        zIndex: 9999,
        animation: `burst 0.6s ease-out forwards`,
        "--angle": `${(360 / 16) * i + (i % 2) * 8}deg`,
        "--dist": `${48 + (i % 4) * 14}px`,
      }}
    />
  ));
}

function Medal({ rank }) {
  if (rank === 1) return <span style={{ fontSize: 18 }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: 18 }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: 18 }}>🥉</span>;
  return <span style={s.rankNum}>{rank}</span>;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AweSUM() {
  // Auth
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState(null); // { token, userId, username }

  // Game
  const [phase, setPhase] = useState(PHASES.LOGIN);
  const [question, setQuestion] = useState(null);
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [flash, setFlash] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [log, setLog] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [shake, setShake] = useState(false);
  const [burst, setBurst] = useState(null);
  const [scoreAnim, setScoreAnim] = useState(false);

  // Results
  const [myComposite, setMyComposite] = useState(null);
  const [myRank, setMyRank] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // "saving"|"saved"|"error"

  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const qBoxRef = useRef(null);
  const logRef = useRef(null);
  const processingRef = useRef(false);
  const finalScoreRef = useRef(0);
  const finalElapsedRef = useRef(0);

  // ── AUTH ──
  const handleAuth = async () => {
    const u = usernameInput.trim();
    const p = passwordInput.trim();
    if (!u || !p) {
      setAuthError("Please fill in both fields.");
      return;
    }
    if (u.length < 3) {
      setAuthError("Username must be at least 3 characters.");
      return;
    }
    if (p.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      let data;
      if (authMode === "signup") {
        data = await sb.signUp(u, p);
        if (data.error || data.msg) {
          setAuthError(data.error_description || data.msg || "Signup failed.");
          setAuthLoading(false);
          return;
        }
        // After signup, sign in immediately
        data = await sb.signIn(u, p);
      } else {
        data = await sb.signIn(u, p);
      }

      if (data.error || !data.access_token) {
        setAuthError(data.error_description || "Invalid username or password.");
        setAuthLoading(false);
        return;
      }

      setUser({
        token: data.access_token,
        userId: data.user.id,
        username: data.user.user_metadata?.username || u,
      });
      setPhase(PHASES.IDLE);
    } catch (e) {
      setAuthError("Connection error. Check your Supabase config.");
    }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    setUser(null);
    setPhase(PHASES.LOGIN);
    setUsernameInput("");
    setPasswordInput("");
    setAuthError("");
    clearInterval(timerRef.current);
  };

  // ── GAME ──
  const nextQuestion = useCallback(() => {
    setQuestion(generateQuestion());
    setInput("");
    setFlash(null);
    processingRef.current = false;
  }, []);

  const startGame = () => {
    setScore(0);
    setLives(MAX_LIVES);
    setElapsed(0);
    setLog([]);
    setFlash(null);
    setBurst(null);
    setSaveStatus(null);
    setMyRank(null);
    processingRef.current = false;
    setPhase(PHASES.PLAYING);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(
      () => setElapsed(Date.now() - startTimeRef.current),
      50,
    );
    setQuestion(generateQuestion());
  };

  const endGame = useCallback((fs) => {
    clearInterval(timerRef.current);
    const ms = Date.now() - startTimeRef.current;
    finalElapsedRef.current = ms;
    finalScoreRef.current = fs;
    setElapsed(ms);
    setMyComposite(calcComposite(fs, ms));
    setPhase(PHASES.OVER);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || !question || processingRef.current) return;
    processingRef.current = true;
    const ans = parseInt(input.trim(), 10);
    const ok = ans === question.answer;
    setLog((prev) => [
      ...prev,
      {
        q: `${question.a} + ${question.b}`,
        correct: question.answer,
        given: ans,
        ok,
        time: formatTime(Date.now() - startTimeRef.current),
      },
    ]);
    setFlash(ok ? "correct" : "wrong");

    if (ok) {
      if (qBoxRef.current) {
        const r = qBoxRef.current.getBoundingClientRect();
        setBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        setTimeout(() => setBurst(null), 700);
      }
      setScoreAnim(true);
      setTimeout(() => setScoreAnim(false), 420);
      setScore((prev) => {
        setTimeout(nextQuestion, 480);
        return prev + 1;
      });
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setLives((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setScore((sc) => {
            setTimeout(() => endGame(sc), 600);
            return sc;
          });
        } else {
          setTimeout(nextQuestion, 520);
        }
        return next;
      });
    }
  }, [input, question, nextQuestion, endGame]);

  const handleNumKey = (val) => {
    if (processingRef.current) return;
    if (val === "⌫") setInput((p) => p.slice(0, -1));
    else if (val === "OK") handleSubmit();
    else setInput((p) => (p.length < 4 ? p + val : p));
  };

  // ── LEADERBOARD ──
  const handleSaveAndBoard = async () => {
    setSaveStatus("saving");
    setBoardLoading(true);
    const composite = calcComposite(
      finalScoreRef.current,
      finalElapsedRef.current,
    );

    await sb.upsertScore(
      user.token,
      user.userId,
      user.username,
      finalScoreRef.current,
      finalElapsedRef.current,
      composite,
    );
    setSaveStatus("saved");

    const board = await sb.getLeaderboard();
    setLeaderboard(board);
    const rank =
      board.findIndex(
        (e) => e.username.toLowerCase() === user.username.toLowerCase(),
      ) + 1;
    setMyRank(rank > 0 ? rank : null);
    setBoardLoading(false);
    setPhase(PHASES.BOARD);
  };

  const handleViewBoard = async () => {
    setBoardLoading(true);
    setPhase(PHASES.BOARD);
    const board = await sb.getLeaderboard();
    setLeaderboard(board);
    setBoardLoading(false);
  };

  useEffect(() => {
    if (showLog && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, showLog]);
  useEffect(() => () => clearInterval(timerRef.current), []);

  const heartIcons = Array.from({ length: MAX_LIVES }, (_, i) => i < lives);
  const numpadKeys = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "⌫",
    "0",
    "OK",
  ];

  return (
    <div style={s.root}>
      <style>{css}</style>
      <CorrectBurst origin={burst} />

      {/* ── LOGIN / SIGNUP ── */}
      {phase === PHASES.LOGIN && (
        <div style={s.screen}>
          <div style={s.logoWrap}>
            <AweSumLogo size={52} />
            <p style={s.tagline}>
              The addition game that
              <br />
              rewards speed & accuracy.
            </p>
          </div>

          <div style={s.authCard}>
            <div style={s.authTabs}>
              <button
                style={{
                  ...s.authTab,
                  ...(authMode === "login" ? s.authTabActive : {}),
                }}
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                }}
              >
                LOG IN
              </button>
              <button
                style={{
                  ...s.authTab,
                  ...(authMode === "signup" ? s.authTabActive : {}),
                }}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError("");
                }}
              >
                SIGN UP
              </button>
            </div>

            <input
              style={s.authInput}
              type="text"
              placeholder="Username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <input
              style={s.authInput}
              type="password"
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAuth()}
            />

            {authError && <div style={s.authError}>{authError}</div>}

            <button
              style={s.primaryBtn}
              onClick={handleAuth}
              disabled={authLoading}
              className={!authLoading ? "pulse-btn" : ""}
            >
              {authLoading
                ? "..."
                : authMode === "login"
                  ? "LOG IN →"
                  : "CREATE ACCOUNT →"}
            </button>
          </div>
        </div>
      )}

      {/* ── IDLE ── */}
      {phase === PHASES.IDLE && (
        <div style={s.screen}>
          <div style={s.topNav}>
            <AweSumLogo size={32} />
            <button style={s.logoutBtn} onClick={handleLogout}>
              logout
            </button>
          </div>

          <div style={s.welcomeBadge}>
            Hey, <span style={{ color: "#FF3333" }}>{user?.username}</span> 👋
          </div>

          <div style={s.rulesGrid}>
            {[
              ["✅", "Correct → +1 point"],
              ["❌", "Wrong → −1 life"],
              ["💀", "0 lives → Game Over"],
              ["⚡", "Score = accuracy × speed"],
            ].map(([icon, text]) => (
              <div key={text} style={s.ruleItem}>
                <span style={s.ruleIcon}>{icon}</span>
                <span style={s.ruleText}>{text}</span>
              </div>
            ))}
          </div>

          <button
            style={s.primaryBtn}
            onClick={startGame}
            className="pulse-btn"
          >
            PLAY NOW
          </button>
          <button style={s.ghostBtn} onClick={handleViewBoard}>
            🏆 LEADERBOARD
          </button>
        </div>
      )}

      {/* ── PLAYING ── */}
      {phase === PHASES.PLAYING && (
        <div style={s.screen}>
          <div style={s.topBar}>
            <div style={s.livesRow}>
              {heartIcons.map((alive, i) => (
                <span
                  key={i}
                  style={{ ...s.heart, opacity: alive ? 1 : 0.18 }}
                  className={!alive ? "heart-lost" : ""}
                >
                  ♥
                </span>
              ))}
            </div>
            <div style={s.timerPill}>
              ⏱ <span style={s.timerVal}>{formatTime(elapsed)}</span>
            </div>
            <div style={s.scorePill}>
              <span style={s.scorePillLabel}>PTS</span>
              <span
                style={s.scorePillVal}
                className={scoreAnim ? "score-pop" : ""}
              >
                {score}
              </span>
            </div>
          </div>

          <div
            ref={qBoxRef}
            style={{
              ...s.questionBox,
              borderColor:
                flash === "correct"
                  ? "#FF3333"
                  : flash === "wrong"
                    ? "#ff2d55"
                    : "#333",
              boxShadow:
                flash === "correct"
                  ? "0 0 40px #FF333355"
                  : flash === "wrong"
                    ? "0 0 40px #ff2d5540"
                    : "none",
            }}
            className={
              shake ? "shake" : flash === "correct" ? "correct-pop" : ""
            }
          >
            <span style={s.qNum}>{question?.a}</span>
            <span style={s.qOp}>+</span>
            <span style={s.qNum}>{question?.b}</span>
            <span style={s.qEq}>=</span>
            <span style={{ ...s.qMark, color: input ? "#fff" : "#FF3333" }}>
              {input || "?"}
            </span>
          </div>

          <div
            style={{
              ...s.flashLabel,
              opacity: flash ? 1 : 0,
              color: flash === "correct" ? "#FF3333" : "#ff2d55",
            }}
          >
            {flash === "correct" ? "✓  CORRECT!" : "✗  WRONG!"}
          </div>

          <div style={s.numpad}>
            {numpadKeys.map((k) => (
              <button
                key={k}
                style={{
                  ...s.numKey,
                  ...(k === "OK" ? s.numKeyOK : {}),
                  ...(k === "⌫" ? s.numKeyDel : {}),
                }}
                onClick={() => handleNumKey(k)}
              >
                {k}
              </button>
            ))}
          </div>

          <button style={s.logToggle} onClick={() => setShowLog((v) => !v)}>
            {showLog ? "▲ HIDE LOG" : "▼ SHOW LOG"}
          </button>
          {showLog && (
            <div style={s.liveLog} ref={logRef}>
              {log.length === 0 && <div style={s.logEmpty}>No answers yet</div>}
              {log.map((e, i) => (
                <div
                  key={i}
                  style={{
                    ...s.logRow,
                    borderLeftColor: e.ok ? "#FF3333" : "#444",
                  }}
                >
                  <span style={s.logIdx}>#{i + 1}</span>
                  <span style={s.logQ}>{e.q}</span>
                  <span
                    style={{ ...s.logAns, color: e.ok ? "#FF3333" : "#888" }}
                  >
                    {e.ok ? `= ${e.correct}` : `✗ ${e.given}`}
                  </span>
                  <span style={s.logTime}>{e.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── GAME OVER ── */}
      {phase === PHASES.OVER && (
        <div style={s.screen}>
          <div style={s.topNav}>
            <AweSumLogo size={28} />
            <button style={s.logoutBtn} onClick={handleLogout}>
              logout
            </button>
          </div>

          <div style={s.gameOverTitle}>
            GAME
            <br />
            OVER
          </div>

          <div style={s.compositeCard}>
            <span style={s.compositeLabel}>COMPOSITE SCORE</span>
            <span style={s.compositeVal}>{myComposite?.toLocaleString()}</span>
            <span style={s.compositeFormula}>
              {finalScoreRef.current} correct ·{" "}
              {formatTime(finalElapsedRef.current)}
            </span>
          </div>

          <div style={s.resultGrid}>
            {[
              ["CORRECT", finalScoreRef.current],
              ["TIME", formatTime(finalElapsedRef.current)],
              ["ROUNDS", log.length],
              [
                "ACCURACY",
                log.length > 0
                  ? `${Math.round((finalScoreRef.current / log.length) * 100)}%`
                  : "—",
              ],
            ].map(([label, val]) => (
              <div key={label} style={s.resultCard}>
                <span style={s.resultLabel}>{label}</span>
                <span style={s.resultVal}>{val}</span>
              </div>
            ))}
          </div>

          <div style={s.overActions}>
            <button
              style={s.primaryBtn}
              onClick={handleSaveAndBoard}
              disabled={saveStatus === "saving" || saveStatus === "saved"}
            >
              {saveStatus === "saving"
                ? "SAVING…"
                : saveStatus === "saved"
                  ? "✓ SAVED"
                  : "🏆 SAVE & VIEW LEADERBOARD"}
            </button>
            <button style={s.ghostBtn} onClick={startGame}>
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      {/* ── LEADERBOARD ── */}
      {phase === PHASES.BOARD && (
        <div style={s.screen}>
          <div style={s.topNav}>
            <AweSumLogo size={28} />
            <button style={s.logoutBtn} onClick={handleLogout}>
              logout
            </button>
          </div>

          <div style={s.boardHeader}>
            <span style={s.boardTitle}>🏆 Leaderboard</span>
            <button style={s.backBtn} onClick={() => setPhase(PHASES.IDLE)}>
              ← back
            </button>
          </div>

          {myRank && (
            <div style={s.rankBadge}>
              You're ranked <span style={{ color: "#FF3333" }}>#{myRank}</span>{" "}
              with{" "}
              <span style={{ color: "#fff" }}>
                {myComposite?.toLocaleString()}
              </span>{" "}
              pts
            </div>
          )}

          {boardLoading ? (
            <div style={s.loadingMsg}>Loading…</div>
          ) : leaderboard.length === 0 ? (
            <div style={s.loadingMsg}>No scores yet. Play first!</div>
          ) : (
            <div style={s.boardList}>
              {leaderboard.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    ...s.boardRow,
                    background:
                      entry.username?.toLowerCase() ===
                      user?.username?.toLowerCase()
                        ? "#1a0808"
                        : "#0f0f0f",
                    borderLeftColor:
                      i === 0
                        ? "#ffd60a"
                        : i === 1
                          ? "#c0c0c0"
                          : i === 2
                            ? "#cd7f32"
                            : "#2a2a2a",
                    borderLeftWidth: i < 3 ? 4 : 2,
                  }}
                >
                  <div style={s.boardRankCol}>
                    <Medal rank={i + 1} />
                  </div>
                  <div style={s.boardNameCol}>
                    <span
                      style={{
                        ...s.boardName,
                        color:
                          entry.username?.toLowerCase() ===
                          user?.username?.toLowerCase()
                            ? "#FF3333"
                            : "#e0e0e0",
                      }}
                    >
                      {entry.username}
                    </span>
                    <span style={s.boardMeta}>
                      {entry.correct_answers} correct ·{" "}
                      {formatTime(entry.time_ms)}
                    </span>
                  </div>
                  <div style={s.boardComposite}>
                    {entry.composite_score?.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            style={s.primaryBtn}
            onClick={startGame}
            className="pulse-btn"
          >
            PLAY NOW
          </button>
        </div>
      )}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = {
  root: {
    minHeight: "100dvh",
    background: "#0a0a0a",
    fontFamily: "'Arial Black', Arial, sans-serif",
    display: "flex",
    justifyContent: "center",
  },
  screen: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 18px 40px",
    gap: 16,
  },

  // Logo / auth
  logoWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  tagline: {
    color: "#555",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 1.7,
    margin: 0,
    fontFamily: "Arial, sans-serif",
    fontWeight: "normal",
  },

  authCard: {
    width: "100%",
    background: "#141414",
    border: "1px solid #222",
    borderRadius: 16,
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  authTabs: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid #222",
    marginBottom: 4,
  },
  authTab: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: "#444",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 2,
    padding: "10px 0",
    cursor: "pointer",
    fontFamily: "'Arial Black', Arial, sans-serif",
    borderBottom: "2px solid transparent",
    marginBottom: -1,
  },
  authTabActive: { color: "#FF3333", borderBottomColor: "#FF3333" },
  authInput: {
    width: "100%",
    background: "#0f0f0f",
    border: "1px solid #252525",
    borderRadius: 10,
    color: "#e0e0e0",
    fontSize: 16,
    fontWeight: "bold",
    padding: "13px 16px",
    fontFamily: "Arial, sans-serif",
    outline: "none",
  },
  authError: {
    color: "#ff4444",
    fontSize: 12,
    textAlign: "center",
    fontFamily: "Arial, sans-serif",
    fontWeight: "normal",
  },
  primaryBtn: {
    width: "100%",
    background: "#FF3333",
    border: "none",
    color: "#fff",
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 2,
    padding: "17px",
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "'Arial Black', Arial, sans-serif",
  },
  ghostBtn: {
    width: "100%",
    background: "transparent",
    border: "1px solid #2a2a2a",
    color: "#666",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    padding: "13px",
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "'Arial Black', Arial, sans-serif",
  },

  // Nav
  topNav: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoutBtn: {
    background: "transparent",
    border: "none",
    color: "#333",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "Arial, sans-serif",
    letterSpacing: 1,
  },
  welcomeBadge: {
    fontSize: 18,
    color: "#888",
    fontFamily: "Arial, sans-serif",
    fontWeight: "normal",
  },

  rulesGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    width: "100%",
  },
  ruleItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#111",
    border: "1px solid #1e1e1e",
    borderRadius: 10,
    padding: "12px 12px",
  },
  ruleIcon: { fontSize: 17 },
  ruleText: {
    fontSize: 11,
    color: "#555",
    lineHeight: 1.4,
    fontFamily: "Arial, sans-serif",
    fontWeight: "normal",
  },

  // Top bar
  topBar: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  livesRow: { display: "flex", gap: 5 },
  heart: { fontSize: 26, color: "#FF3333", transition: "opacity 0.3s" },
  timerPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#141414",
    border: "1px solid #1e1e1e",
    borderRadius: 20,
    padding: "7px 14px",
    fontSize: 14,
    color: "#555",
  },
  timerVal: {
    fontSize: 15,
    fontWeight: 900,
    color: "#ffd60a",
    fontVariantNumeric: "tabular-nums",
  },
  scorePill: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "#141414",
    border: "1px solid #1e1e1e",
    borderRadius: 20,
    padding: "4px 16px",
    minWidth: 54,
  },
  scorePillLabel: { fontSize: 8, letterSpacing: 3, color: "#333" },
  scorePillVal: { fontSize: 24, fontWeight: 900, color: "#fff" },

  // Question
  questionBox: {
    width: "100%",
    background: "#0f0f0f",
    border: "2px solid",
    borderRadius: 18,
    padding: "26px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    transition: "border-color 0.15s, box-shadow 0.15s",
  },
  qNum: { fontSize: 52, fontWeight: 900, color: "#e8e8e8" },
  qOp: { fontSize: 40, color: "#FF3333", fontWeight: 900 },
  qEq: { fontSize: 40, color: "#2a2a2a" },
  qMark: {
    fontSize: 52,
    fontWeight: 900,
    minWidth: 70,
    textAlign: "center",
    transition: "color 0.1s",
  },
  flashLabel: {
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 4,
    height: 24,
    transition: "opacity 0.1s",
    fontFamily: "'Arial Black', Arial",
  },

  // Numpad
  numpad: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 9,
  },
  numKey: {
    background: "#141414",
    border: "1px solid #1e1e1e",
    borderRadius: 12,
    color: "#d0d0d0",
    fontSize: 22,
    fontWeight: 900,
    fontFamily: "'Arial Black', Arial",
    padding: "17px 0",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
  },
  numKeyOK: {
    background: "#FF3333",
    color: "#fff",
    fontWeight: 900,
    letterSpacing: 1,
    fontSize: 16,
    border: "none",
  },
  numKeyDel: { color: "#555", fontSize: 19 },
  logToggle: {
    background: "transparent",
    border: "none",
    color: "#2a2a2a",
    fontSize: 11,
    letterSpacing: 2,
    cursor: "pointer",
    fontFamily: "'Arial Black', Arial",
  },
  liveLog: {
    width: "100%",
    maxHeight: 140,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  logEmpty: {
    color: "#2a2a2a",
    fontSize: 12,
    textAlign: "center",
    padding: "8px 0",
  },
  logRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    background: "#0f0f0f",
    borderLeft: "3px solid",
    borderRadius: "0 6px 6px 0",
    padding: "6px 10px",
    fontSize: 11,
    color: "#555",
  },
  logIdx: { color: "#2a2a2a", minWidth: 26 },
  logQ: { flex: 1 },
  logAns: { fontWeight: 900, minWidth: 78, textAlign: "right" },
  logTime: { color: "#2a2a2a", minWidth: 56, textAlign: "right", fontSize: 10 },

  // Game Over
  gameOverTitle: {
    fontSize: 48,
    fontWeight: 900,
    color: "#FF3333",
    letterSpacing: 8,
    lineHeight: 1.1,
    textAlign: "center",
    marginTop: 4,
  },
  compositeCard: {
    width: "100%",
    background: "#111",
    border: "1px solid #2a2a2a",
    borderRadius: 16,
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  compositeLabel: {
    fontSize: 9,
    letterSpacing: 4,
    color: "#444",
    fontFamily: "'Arial Black', Arial",
  },
  compositeVal: {
    fontSize: 48,
    fontWeight: 900,
    color: "#FF3333",
    letterSpacing: -1,
  },
  compositeFormula: {
    fontSize: 11,
    color: "#444",
    fontFamily: "Arial, sans-serif",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    width: "100%",
  },
  resultCard: {
    background: "#0f0f0f",
    border: "1px solid #1a1a1a",
    borderRadius: 12,
    padding: "14px 10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
  },
  resultLabel: { fontSize: 9, letterSpacing: 3, color: "#333" },
  resultVal: { fontSize: 26, fontWeight: 900, color: "#e0e0e0" },
  overActions: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  // Leaderboard
  boardHeader: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  boardTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#fff",
    letterSpacing: 2,
  },
  backBtn: {
    background: "transparent",
    border: "none",
    color: "#444",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "Arial, sans-serif",
  },
  rankBadge: {
    width: "100%",
    background: "#111",
    border: "1px solid #1e1e1e",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    fontFamily: "Arial, sans-serif",
  },
  loadingMsg: {
    color: "#333",
    fontSize: 14,
    padding: "24px 0",
    letterSpacing: 2,
  },
  boardList: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 400,
    overflowY: "auto",
  },
  boardRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderLeft: "3px solid",
    borderRadius: "0 10px 10px 0",
    padding: "12px 14px",
  },
  boardRankCol: { minWidth: 30, display: "flex", justifyContent: "center" },
  rankNum: { fontSize: 13, color: "#333", fontWeight: 900 },
  boardNameCol: { flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  boardName: { fontSize: 15, fontWeight: 900 },
  boardMeta: { fontSize: 10, color: "#333", fontFamily: "Arial, sans-serif" },
  boardComposite: {
    fontSize: 20,
    fontWeight: 900,
    color: "#FF3333",
    minWidth: 68,
    textAlign: "right",
  },
};

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; overscroll-behavior: none; background: #0a0a0a; }

  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20% { transform: translateX(-9px); }
    40% { transform: translateX(9px); }
    60% { transform: translateX(-6px); }
    80% { transform: translateX(5px); }
  }
  .shake { animation: shake 0.42s ease; }

  @keyframes correctPop {
    0% { transform: scale(1); }
    40% { transform: scale(1.07); }
    100% { transform: scale(1); }
  }
  .correct-pop { animation: correctPop 0.38s ease; }

  @keyframes burst {
    0%   { transform: translate(-50%,-50%) rotate(var(--angle)) translateX(0) scale(1.2); opacity: 1; }
    100% { transform: translate(-50%,-50%) rotate(var(--angle)) translateX(var(--dist)) scale(0); opacity: 0; }
  }

  @keyframes scorePop {
    0%   { transform: scale(1); }
    45%  { transform: scale(1.5); color: #FF3333; }
    100% { transform: scale(1); }
  }
  .score-pop { animation: scorePop 0.4s ease; }

  @keyframes pulse {
    0%,100% { box-shadow: 0 0 24px #FF333340; transform: scale(1); }
    50%      { box-shadow: 0 0 48px #FF333388; transform: scale(1.02); }
  }
  .pulse-btn { animation: pulse 2s ease-in-out infinite; }

  @keyframes heartLost {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.4); opacity: 0.6; }
    100% { transform: scale(0.7); opacity: 0.18; }
  }
  .heart-lost { animation: heartLost 0.38s ease forwards; }

  button:active { transform: scale(0.91) !important; }

  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }

  input::placeholder { color: #2a2a2a; }
  input:focus { border-color: #FF3333 !important; outline: none; }
`;
