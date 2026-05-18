import { useRef, useState, useEffect } from "react";
import html2canvas from "html2canvas";
import "./App.css";

// 简单的 XOR 加密（基础混淆，非真正安全）
const XOR_KEY = "ArcaeaOnline2024";
function xorEncrypt(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
  }
  return btoa(result);
}
function xorDecrypt(encoded: string): string {
  try {
    const text = atob(encoded);
    let result = "";
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return result;
  } catch {
    return "";
  }
}

type SavedAccount = {
  email: string;
  password: string;
};

type QueryRecord = {
  id: string;
  name: string;
  userCode: string;
  potential: number;
  timestamp: number;
  b30Potential: number;
  r10Potential: number;
};

const STORAGE_KEY_ACCOUNT = "arcaea_saved_account";
const STORAGE_KEY_RECORDS = "arcaea_query_records";

function getSavedAccount(): SavedAccount | null {
  const data = localStorage.getItem(STORAGE_KEY_ACCOUNT);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    return {
      email: xorDecrypt(parsed.email),
      password: xorDecrypt(parsed.password),
    };
  } catch {
    return null;
  }
}

function saveAccount(email: string, password: string) {
  const data = {
    email: xorEncrypt(email),
    password: xorEncrypt(password),
  };
  localStorage.setItem(STORAGE_KEY_ACCOUNT, JSON.stringify(data));
}

function clearSavedAccount() {
  localStorage.removeItem(STORAGE_KEY_ACCOUNT);
}

function getQueryRecords(): QueryRecord[] {
  const data = localStorage.getItem(STORAGE_KEY_RECORDS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function addQueryRecord(record: QueryRecord) {
  const records = getQueryRecords();
  // 去重：如果同一个用户已存在，先删除旧的
  const filtered = records.filter((r) => r.userCode !== record.userCode);
  filtered.unshift(record);
  // 最多保留10条
  const limited = filtered.slice(0, 10);
  localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(limited));
}

function deleteQueryRecord(userCode: string) {
  const records = getQueryRecords();
  const filtered = records.filter((r) => r.userCode !== userCode);
  localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(filtered));
}

function formatRecordTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

type ResponseSong = {
  title: string;
  artist: string;
  id: string;

  difficulty: "past" | "present" | "future" | "beyond" | "eternal";

  clearType:
    | "track_lost"
    | "normal_clear"
    | "full_recall"
    | "pure_memory"
    | "easy_clear"
    | "hard_clear";
  ranking: "ex_plus" | "ex" | "aa" | "a" | "b" | "c" | "d";

  rating: number;
  base: number;

  perfect: number;
  near: number;
  miss: number;

  timePlayed: number;
  backgroundName: string;
};

type UserData = {
  name: string;
  user_code: string;
  rating: number;
  character: number;
  icon: string;
  profile_image: string;
};

type Response =
  | {
      success: true;
      b30: ResponseSong[];
      r10: ResponseSong[];
      user?: UserData;
    }
  | {
      success: false;
      message: string;
      error: string;
    };

const DIFFICULTY_LABELS: Record<string, string> = {
  past: "PST",
  present: "PRS",
  future: "FTR",
  beyond: "BYD",
  eternal: "ETR",
};

const CLEAR_TYPE_LABELS: Record<string, string> = {
  track_lost: "TL",
  normal_clear: "NC",
  full_recall: "FR",
  pure_memory: "PM",
  easy_clear: "EC",
  hard_clear: "HC",
};

function getCoverUrl(backgroundName: string): string {
  return `https://webassets.lowiro.com/${backgroundName}.jpg`;
}

function getProxyCoverUrl(backgroundName: string): string {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
  return `${backendUrl}/cover?name=${encodeURIComponent(backgroundName)}`;
}

function getCharIconUrl(hash: string): string {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
  return `${backendUrl}/char-icon?hash=${encodeURIComponent(hash)}`;
}

function getCharProfileUrl(hash: string): string {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
  return `${backendUrl}/char-profile?hash=${encodeURIComponent(hash)}`;
}

function formatScore(perfect: number, near: number, miss: number): string {
  const total = perfect + near + miss;
  if (total === 0) return "0";
  const score = (perfect * 2 + near) / (total * 2) * 10000000;
  return Math.floor(score).toLocaleString("en-US").padStart(9, "0");
}

function getDaysAgo(timePlayed: number): string {
  const now = Date.now();
  const diffMs = now - timePlayed;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  return `${diffDays}d`;
}

function ScoreCard({ song, rank }: { song: ResponseSong; rank: number }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <article className={`score-card rank-${rank}`}>
      <div className="song-jacket">
        <div className="jacket-box">
          <div className={`jacket-placeholder ${imageLoaded ? "hidden" : ""}`}>♪</div>
          {!imageError && (
            <img
              src={getCoverUrl(song.backgroundName)}
              alt={song.title}
              className={imageLoaded ? "loaded" : ""}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          )}
        </div>
      </div>
      <div className="song-info">
        <div className="info-header">
          <h3 className="song-title" title={song.title}>{song.title}</h3>
          <span className="rank-num">#{rank}</span>
        </div>
        <div className="score">{formatScore(song.perfect, song.near, song.miss)}</div>
        <div className="potential-line">
          <span className="base">{song.base.toFixed(1)}</span>
          <span className="arrow"> &gt; </span>
          <span className="rating">{song.rating.toFixed(4)}</span>
          <span className="clear-type"> {CLEAR_TYPE_LABELS[song.clearType]}</span>
        </div>
        <div className="meta">
          <span className={`difficulty difficulty-${song.difficulty}`}>{DIFFICULTY_LABELS[song.difficulty]}</span>
          <span className="ranking">{song.ranking === "ex_plus" ? "EX+" : song.ranking.toUpperCase()}</span>
          <span className="time">{getDaysAgo(song.timePlayed)}</span>
        </div>
      </div>
    </article>
  );
}

function ScoreRow({ songs, startRank }: { songs: ResponseSong[]; startRank: number }) {
  return (
    <div className="score-row">
      {songs.map((song, i) => (
        <ScoreCard key={song.id} song={song} rank={startRank + i} />
      ))}
    </div>
  );
}

function ScoreGrid({ songs, startRank = 1 }: { songs: ResponseSong[]; startRank?: number }) {
  const rows = [];
  for (let i = 0; i < songs.length; i += 3) {
    rows.push(
      <ScoreRow
        key={i}
        songs={songs.slice(i, i + 3)}
        startRank={startRank + i}
      />
    );
  }
  return <div className="scores-grid">{rows}</div>;
}

function getRatingIcon(potential: number): string {
  if (potential >= 13.0) return "/ratings/rating_7.png";
  if (potential >= 12.5) return "/ratings/rating_6.png";
  if (potential >= 12.0) return "/ratings/rating_5.png";
  if (potential >= 11.0) return "/ratings/rating_4.png";
  if (potential >= 10.0) return "/ratings/rating_3.png";
  if (potential >= 7.0) return "/ratings/rating_2.png";
  if (potential >= 3.5) return "/ratings/rating_1.png";
  return "/ratings/rating_0.png";
}

// 图片生成组件 - 包含B30和R10上下拼接
function ImageContent({ 
  b30, 
  r10, 
  user, 
  b30Potential, 
  r10Potential, 
  displayPotential 
}: { 
  b30: ResponseSong[]; 
  r10: ResponseSong[]; 
  user?: UserData;
  b30Potential: number;
  r10Potential: number;
  displayPotential: number;
}) {
  const displayName = user?.name ?? "Player";
  const displayId = user?.user_code ?? "000000000";

  return (
    <div className="image-export-container">
      {user?.profile_image && (
        <div className="image-char-profile-bg">
          <img 
            src={getCharProfileUrl(user.profile_image)} 
            alt="character" 
            className="image-char-profile-img"
          />
        </div>
      )}
      <div className="image-header">
        <div className="image-player-profile">
          <div className="image-avatar">
            {user?.icon && (
              <img 
                src={getCharIconUrl(user.icon)} 
                alt="avatar" 
                className="image-avatar-img"
              />
            )}
          </div>
          <div className="image-player-info">
            <h1 className="image-player-name">{displayName}</h1>
            <span className="image-player-id">ID: {displayId}</span>
          </div>
          <div className="image-potential-badge">
            <img src={getRatingIcon(displayPotential)} alt="rating" className="image-rating-icon" />
            <span className="image-potential-text">{Math.floor(displayPotential * 100) / 100}</span>
          </div>
        </div>
        <div className="image-stats-grid">
          <div className="image-stat-card">
            <label>BEST 30 AVG.</label>
            <span>{b30Potential.toFixed(4)}</span>
          </div>
          <div className="image-stat-card">
            <label>RECENT 10 AVG.</label>
            <span>{r10Potential.toFixed(4)}</span>
          </div>
        </div>
      </div>

      <div className="image-section">
        <h2 className="image-section-title">Best 30</h2>
        <ScoreGrid songs={b30} />
      </div>

      <div className="image-section">
        <h2 className="image-section-title">Recent 10</h2>
        <ScoreGrid songs={r10} startRank={1} />
      </div>
    </div>
  );
}

function ResultPage({ response }: { response: Response }) {
  if (!response.success) return null;

  const [isGenerating, setIsGenerating] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);
  
  const b30 = response.b30;
  const r10 = response.r10;
  const b30Potential = b30.reduce((sum, s) => sum + s.rating, 0) / 30;
  const r10Potential = r10.reduce((sum, s) => sum + s.rating, 0) / 10;
  const overallPotential = (b30Potential * 3 + r10Potential) / 4;
  
  const user = response.user;
  const displayName = user?.name ?? "Player";
  const displayId = user?.user_code ?? "000000000";
  const displayPotential = user ? user.rating / 100 : overallPotential;

  const handleDownload = async () => {
    if (!imageRef.current || isGenerating) return;
    setIsGenerating(true);

    try {
      // 克隆节点用于截图
      const clone = imageRef.current.cloneNode(true) as HTMLDivElement;
      clone.style.position = "fixed";
      clone.style.left = "-9999px";
      clone.style.top = "0";
      clone.style.width = "600px";
      clone.style.opacity = "1";
      document.body.appendChild(clone);

      // 将所有图片转换为 Blob URL
      const images = clone.querySelectorAll("img");
      const blobUrls: string[] = [];
      
      for (const img of Array.from(images)) {
        try {
          // 跳过已经是 blob URL 的图片
          if (img.src.startsWith('blob:')) continue;
          
          let fetchUrl = img.src;
          
          // 如果是 webassets 域名，转换为代理 URL
          if (img.src.includes('webassets.lowiro.com')) {
            const backgroundName = img.src.split('/').pop()?.replace('.jpg', '') || '';
            fetchUrl = getProxyCoverUrl(backgroundName);
          }
          
          console.log("Processing image:", img.src, "->", fetchUrl);
          const response = await fetch(fetchUrl);
          if (!response.ok) {
            console.error("Failed to fetch:", fetchUrl, response.status);
            continue;
          }
          const blob = await response.blob();
          console.log("Got blob:", fetchUrl, blob.type, blob.size);
          const blobUrl = URL.createObjectURL(blob);
          blobUrls.push(blobUrl);
          img.src = blobUrl;
          img.crossOrigin = "anonymous";
          console.log("Set blob URL:", blobUrl);
        } catch (e) {
          console.error("Failed to convert to blob:", img.src, e);
        }
      }
      
      console.log("Total images processed:", blobUrls.length);

      // 等待图片加载
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const canvas = await html2canvas(clone, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 30000,
      });

      // 清理 Blob URLs
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
      document.body.removeChild(clone);

      const link = document.createElement("a");
      link.download = `arcaea_${displayName}_${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("Failed to generate image:", e);
      alert("图片生成失败，请重试");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div className="player-bests-container">
        {/* 背景层 */}
        <div className="bg-layer">
          <div className="bg-gradient"></div>
        </div>

        {/* 顶部信息区 */}
        <header className="header-section">
          <div className="player-profile">
            <div className="avatar">
              {user?.icon && (
                <img 
                  src={getCharIconUrl(user.icon)} 
                  alt="avatar" 
                  className="avatar-img"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>
            <div className="player-info">
              <h1 className="player-name">{displayName}</h1>
              <span className="player-id">ID: {displayId}</span>
            </div>
            <div className="potential-badge">
              <img src={getRatingIcon(displayPotential)} alt="rating" className="rating-icon" />
              <span className="potential-text">{Math.floor(displayPotential * 100) / 100}</span>
            </div>
          </div>

          <div className="stats-row">
            <div className="stats-grid">
              <div className="stat-card">
                <label>BEST 30 AVG.</label>
                <span className="stat-value">{b30Potential.toFixed(4)}</span>
              </div>
              <div className="stat-card">
                <label>RECENT 10 AVG.</label>
                <span className="stat-value">{r10Potential.toFixed(4)}</span>
              </div>
            </div>
            <button 
              className="download-btn"
              onClick={handleDownload}
              disabled={isGenerating}
            >
              {isGenerating ? "生成中..." : "下载图片"}
            </button>
          </div>
        </header>

        {/* 内容区域 - 固定手机宽度 */}
        <div className="results-content">
          {user?.profile_image && (
            <div className="char-profile-bg">
              <img 
                src={getCharProfileUrl(user.profile_image)} 
                alt="character" 
                className="char-profile-img"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Best 30 */}
          <section className="score-section">
            <h2 className="section-title">Best 30</h2>
            <ScoreGrid songs={b30} />
          </section>

          {/* Recent 10 */}
          <section className="score-section">
            <h2 className="section-title">Recent 10</h2>
            <ScoreGrid songs={r10} startRank={1} />
          </section>
        </div>
      </div>

      {/* 隐藏的图片生成区域 */}
      <div
        ref={imageRef}
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: "600px",
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        <ImageContent 
          b30={b30} 
          r10={r10} 
          user={user}
          b30Potential={b30Potential}
          r10Potential={r10Potential}
          displayPotential={displayPotential}
        />
      </div>
    </>
  );
}

function LoginForm({
  onLogin,
  onQuickLogin,
}: {
  onLogin?: (email: string, password: string, remember: boolean) => void;
  onQuickLogin?: (record: QueryRecord) => void;
}) {
  const savedAccount = getSavedAccount();
  const [email, setEmail] = useState<string>(savedAccount?.email || "");
  const [password, setPassword] = useState<string>(savedAccount?.password || "");
  const [remember, setRemember] = useState<boolean>(!!savedAccount);
  const [records, setRecords] = useState<QueryRecord[]>(getQueryRecords());

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (onLogin) onLogin(email, password, remember);
  };

  const handleDeleteRecord = (userCode: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    deleteQueryRecord(userCode);
    setRecords(getQueryRecords());
  };

  const handleClearAccount = () => {
    clearSavedAccount();
    setEmail("");
    setPassword("");
    setRemember(false);
  };

  return (
    <div className="login-container">
      <form className="login-form card" onSubmit={handleSubmit} method="post">
        <div>
          <label htmlFor="email">用户名、电子邮箱或用户ID</label>
          <input
            id="email"
            name="email"
            onChange={(ev) => setEmail(ev.target.value)}
            value={email}
            autoComplete="username"
          />
        </div>
        <div>
          <label htmlFor="password">密码</label>
          <input
            id="password"
            name="password"
            onChange={(ev) => setPassword(ev.target.value)}
            value={password}
            type="password"
            autoComplete="current-password"
          />
        </div>

        <div className="remember-row">
          <label className="remember-label">
            <input
              type="checkbox"
              checked={remember}
              onChange={(ev) => setRemember(ev.target.checked)}
            />
            <span>记住我</span>
          </label>
          {savedAccount && (
            <button type="button" className="clear-account-btn" onClick={handleClearAccount}>
              删除保存的账号
            </button>
          )}
        </div>

        <button type="submit">
          登录并查询
        </button>
      </form>

      {records.length > 0 && (
        <div className="query-history card">
          <h3>最近查询</h3>
          <div className="history-list">
            {records.map((record) => (
              <div
                key={record.userCode}
                className="history-item"
                onClick={() => onQuickLogin?.(record)}
              >
                <div className="history-info">
                  <span className="history-name">{record.name}</span>
                  <span className="history-code">ID: {record.userCode}</span>
                  <span className="history-potential">{record.potential.toFixed(2)}</span>
                </div>
                <div className="history-meta">
                  <span className="history-time">{formatRecordTime(record.timestamp)}</span>
                  <button
                    className="delete-record-btn"
                    onClick={(ev) => handleDeleteRecord(record.userCode, ev)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingPage() {
  return (
    <div className="card pending-container">
      <div className="pending-spinner"></div>
      <div className="pending-text">少女折寿中</div>
    </div>
  );
}

function ErrorPage({
  errorMessage,
  retry,
  back,
}: {
  errorMessage: string;
  retry: () => void;
  back: () => void;
}) {
  return (
    <div className="card failure">
      <h2>出错了...</h2>
      <p>{errorMessage}</p>
      <div>
        <button
          onClick={() => {
            retry();
          }}
        >
          重试
        </button>
        <button
          onClick={() => {
            back();
          }}
        >
          返回
        </button>
      </div>
    </div>
  );
}

function App() {
  const [appState, setAppState] = useState<
    "login" | "pending" | "done" | "failure"
  >("login");

  const accountRef = useRef<{ email: string; password: string } | null>(null);
  const [response, setResponse] = useState<Response | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onLogin(email: string, password: string) {
    accountRef.current = { email, password };
    try {
      setAppState("pending");
      const res = await fetch(
        new URL("/query", import.meta.env.VITE_BACKEND_URL),
        {
          body: JSON.stringify({ email, password }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const data = (await res.json()) as Response;
      if (!data.success) {
        setAppState("failure");
        setErrorMessage(data.message);
      } else {
        setAppState("done");
        setResponse(data);
      }
    } catch (e) {
      setAppState("failure");
      console.error(e);
      if (e instanceof Error) {
        setErrorMessage(e.message);
      } else {
        setErrorMessage("未知错误");
      }
    }
  }
  if (appState === "login") {
    return <LoginForm onLogin={onLogin} />;
  }
  if (appState === "pending") {
    return <PendingPage />;
  }

  if (appState === "done") {
    return <ResultPage response={response!} />;
  }
  return (
    <ErrorPage
      errorMessage={errorMessage!}
      retry={() => {
        onLogin(accountRef.current!.email, accountRef.current!.password);
      }}
      back={() => {
        setAppState("login");
      }}
    />
  );
}

export default App;
