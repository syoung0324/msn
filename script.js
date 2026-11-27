// ==========================================
// 1. Firebase Firestore 初始化設定（安全容錯）
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAJ2V3xaQT-Ii7vvwceiOoXfVXuKYrO9iI",
  authDomain: "msn-game.firebaseapp.com",
  projectId: "msn-game",
  storageBucket: "msn-game.firebasestorage.app",
  messagingSenderId: "464009775985",
  appId: "1:464009775985:web:3cba094e11ac78602f04d0"
};

let db = null;
try {
  if (typeof firebase !== "undefined") {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
  }
} catch (err) {
  console.warn("Firebase 初始化略過，將使用本機模式：", err);
}

// ==========================================
// 2. 刺激動態音效引擎 (Web Audio API)
// ==========================================
class ArcadeSoundEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  init() {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    } catch (e) {
      // 忽略瀏覽器音效權限限制
    }
  }

  playTone(freq, type, duration, startTime = 0, vol = 0.25, slideTo = null) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + startTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playSafeDig(revealedCount = 1) {
    const base = 360 + Math.min(revealedCount * 15, 240);
    this.playTone(base, "triangle", 0.09, 0, 0.2, base * 1.35);
    if (revealedCount > 3) {
      this.playTone(base * 1.25, "sine", 0.12, 0.05, 0.18, base * 1.6);
    }
  }

  playMineScore(combo = 1) {
    const pitchBoost = Math.pow(1.09, Math.min(combo - 1, 8));
    this.playTone(150 * pitchBoost, "sawtooth", 0.18, 0, 0.32, 48);
    this.playTone(523.25 * pitchBoost, "square", 0.11, 0.04, 0.22);
    this.playTone(659.25 * pitchBoost, "square", 0.11, 0.11, 0.24);
    this.playTone(783.99 * pitchBoost, "square", 0.13, 0.18, 0.26);
    this.playTone(1046.5 * pitchBoost, "sawtooth", 0.28, 0.25, 0.28, 1318.5 * pitchBoost);
  }

  playTurnSwitch() {
    this.playTone(440, "sine", 0.08, 0, 0.15, 330);
  }

  playMatchPointAlert() {
    this.playTone(880, "sawtooth", 0.1, 0, 0.22);
    this.playTone(880, "sawtooth", 0.1, 0.14, 0.22);
    this.playTone(1174.66, "sawtooth", 0.22, 0.28, 0.26);
  }

  playVictoryFanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    const times = [0, 0.1, 0.2, 0.32, 0.48, 0.6];
    const durs = [0.1, 0.1, 0.12, 0.16, 0.12, 0.45];
    notes.forEach((n, i) => {
      this.playTone(n, "square", durs[i], times[i], 0.26);
      this.playTone(n / 2, "triangle", durs[i], times[i], 0.22);
    });
  }

  playNudge() {
    for (let i = 0; i < 6; i++) {
      this.playTone(i % 2 === 0 ? 190 : 250, "sawtooth", 0.06, i * 0.065, 0.28);
    }
  }

  playChatPop() {
    this.playTone(660, "sine", 0.08, 0, 0.18);
    this.playTone(990, "sine", 0.14, 0.07, 0.18);
  }

  playLeaveAlert() {
    this.playTone(440, "triangle", 0.14, 0, 0.22, 260);
    this.playTone(330, "triangle", 0.22, 0.15, 0.22, 196);
  }
}

const sfx = new ArcadeSoundEngine();

// ==========================================
// 3. 遊戲全域狀態與難度設定
// ==========================================
const DIFFICULTIES = {
  easy: { label: "🌱 快樂入門 (8×8)", rows: 8, cols: 8, mines: 15 },
  medium: { label: "🌼 活力進階 (12×12)", rows: 12, cols: 12, mines: 29 },
  hard: { label: "🏆 經典 MSN (16×16)", rows: 16, cols: 16, mines: 51 }
};

const state = {
  user: {
    uid: "u_" + Math.random().toString(36).substring(2, 10),
    name: "小蜜蜂王",
    avatar: "🐶"
  },
  mode: "ai", // "ai" | "local" | "online"
  difficulty: "medium",
  rows: 12,
  cols: 12,
  totalMines: 29,
  board: [],
  turn: 1,
  scores: { 1: 0, 2: 0 },
  combo: 0,
  hintsLeft: 2,
  gameOver: false,
  aiTimer: null,

  // 線上對戰專用狀態
  roomId: null,
  myRole: 1,
  unsubLobby: null,
  unsubRoom: null,
  unsubChat: null,
  lastNudgeTs: 0,
  hasAutoSwitchedToLobby: false,
  p1Info: { name: "玩家 1", avatar: "🐶" },
  p2Info: { name: "等待加入...", avatar: "⏳" }
};

// ==========================================
// 4. DOM 元素快取
// ==========================================
const el = {
  loginModal: document.getElementById("login-modal"),
  nicknameInput: document.getElementById("nickname-input"),
  avatarPreview: document.getElementById("avatar-preview"),
  appWindow: document.getElementById("app-window"),
  userBadge: document.getElementById("user-badge"),
  board: document.getElementById("board"),
  fxLayer: document.getElementById("fx-layer"),
  p1Card: document.getElementById("card-p1"),
  p2Card: document.getElementById("card-p2"),
  p1Avatar: document.getElementById("p1-avatar"),
  p2Avatar: document.getElementById("p2-avatar"),
  p1Name: document.getElementById("p1-name"),
  p2Name: document.getElementById("p2-name"),
  p1Score: document.getElementById("p1-score"),
  p2Score: document.getElementById("p2-score"),
  remainingMines: document.getElementById("remaining-mines"),
  targetScore: document.getElementById("target-score"),
  turnBanner: document.getElementById("turn-banner"),
  faceBtn: document.getElementById("btn-face"),
  hintCount: document.getElementById("hint-count"),
  onlinePanel: document.getElementById("online-panel"),
  roomLobbyControls: document.getElementById("room-lobby-controls"),
  waitingRoomsList: document.getElementById("waiting-rooms-list"),
  lobbyCountBadge: document.getElementById("lobby-count-badge"),
  roomActiveBar: document.getElementById("room-active-bar"),
  displayRoomCode: document.getElementById("display-room-code"),
  roomStatusText: document.getElementById("room-status-text"),
  chatMessages: document.getElementById("chat-messages"),
  chatInput: document.getElementById("chat-input"),
  chatModeLabel: document.getElementById("chat-mode-label"),
  resultModal: document.getElementById("result-modal"),
  resultEmoji: document.getElementById("result-emoji"),
  resultTitle: document.getElementById("result-title"),
  resultDetail: document.getElementById("result-detail"),
  leaveNoticeModal: document.getElementById("leave-notice-modal"),
  leaveNoticeTitle: document.getElementById("leave-notice-title"),
  leaveNoticeDesc: document.getElementById("leave-notice-desc")
};

// ==========================================
// 5. 登入與大廳即時房間監聽
// ==========================================
document.querySelectorAll(".avatar-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".avatar-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.user.avatar = btn.dataset.avatar;
    if (el.avatarPreview) {
      el.avatarPreview.textContent = state.user.avatar;
    }
  });
});

function enterLobbyHandler() {
  const nick = el.nicknameInput.value.trim();
  state.user.name = nick || "快樂小玩家";
  el.userBadge.textContent = `${state.user.avatar} ${state.user.name}`;

  // 立即切換視窗顯示，不被外部服務阻塞
  el.loginModal.classList.add("hidden");
  el.appWindow.classList.remove("hidden");

  try {
    sfx.init();
    sfx.playChatPop();
  } catch (e) {}

  startNewLocalGame();

  // 登入後監聽線上大廳是否有等待中的房間
  try {
    listenToWaitingRooms(true);
  } catch (e) {
    console.warn("監聽線上大廳失敗：", e);
  }
}

document.getElementById("btn-enter-lobby").addEventListener("click", enterLobbyHandler);
el.nicknameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    enterLobbyHandler();
  }
});

function listenToWaitingRooms(autoSwitchIfAvailable = false) {
  if (!db) return;
  if (state.unsubLobby) state.unsubLobby();

  state.unsubLobby = db
    .collection("msn_minesweeper_rooms")
    .where("status", "==", "waiting")
    .onSnapshot(
      (snapshot) => {
        const rooms = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.p1 && data.p1.uid !== state.user.uid) {
            rooms.push(data);
          }
        });

        if (rooms.length > 0) {
          el.lobbyCountBadge.textContent = rooms.length;
          el.lobbyCountBadge.classList.remove("hidden");

          if (autoSwitchIfAvailable && !state.hasAutoSwitchedToLobby && !state.roomId) {
            state.hasAutoSwitchedToLobby = true;
            switchGameMode("online");
            appendSystemMsg(`🎉 發現大廳有 ${rooms.length} 個房間正在等待對手，點擊即可立即開戰！`);
          }
        } else {
          el.lobbyCountBadge.classList.add("hidden");
        }

        renderWaitingRoomsList(rooms);
      },
      (err) => {
        console.warn("Firestore 監聽權限或連線提示：", err);
        el.waitingRoomsList.innerHTML =
          '<div class="empty-lobby">⚠️ 無法連線至線上大廳（請檢查 Firestore 安全規則是否允許讀寫）</div>';
      }
    );
}

function renderWaitingRoomsList(rooms) {
  el.waitingRoomsList.innerHTML = "";
  if (rooms.length === 0) {
    el.waitingRoomsList.innerHTML =
      '<div class="empty-lobby">🔍 目前大廳沒有等待中的房間，按右上角「➕ 建立新房間」當房主吧！</div>';
    return;
  }

  rooms.forEach((room) => {
    const diffLabel = DIFFICULTIES[room.difficulty]?.label || "🌼 活力進階";
    const card = document.createElement("div");
    card.className = "room-card";
    card.innerHTML = `
      <div class="room-host-info">
        <div class="room-host-avatar">${room.p1?.avatar || "🐶"}</div>
        <div>
          <div class="room-host-name">${escapeHtml(room.p1?.name || "神秘房主")} 的房間</div>
          <div class="room-meta">${diffLabel} · 房號 #${room.roomId}</div>
        </div>
      </div>
      <button type="button" class="btn-join-now">⚔️ 加入對戰</button>
    `;
    card.querySelector(".btn-join-now").addEventListener("click", () => {
      joinOnlineRoomById(room.roomId);
    });
    el.waitingRoomsList.appendChild(card);
  });
}

// ==========================================
// 6. 棋盤生成與核心踩地雷邏輯
// ==========================================
function generateBoardData(rows, cols, totalMines) {
  const total = rows * cols;
  const cells = Array.from({ length: total }, () => ({
    mine: false,
    revealed: false,
    owner: 0,
    adj: 0
  }));

  let placed = 0;
  while (placed < totalMines) {
    const idx = Math.floor(Math.random() * total);
    if (!cells[idx].mine) {
      cells[idx].mine = true;
      placed++;
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (cells[idx].mine) continue;
      let count = 0;
      getNeighbors(r, c, rows, cols).forEach(([nr, nc]) => {
        if (cells[nr * cols + nc].mine) count++;
      });
      cells[idx].adj = count;
    }
  }
  return cells;
}

function getNeighbors(r, c, rows, cols) {
  const res = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        res.push([nr, nc]);
      }
    }
  }
  return res;
}

function floodReveal(board, startIdx, rows, cols) {
  const stack = [startIdx];
  let revealedCount = 0;

  while (stack.length > 0) {
    const idx = stack.pop();
    const cell = board[idx];
    if (cell.revealed || cell.mine) continue;

    cell.revealed = true;
    revealedCount++;

    if (cell.adj === 0) {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      getNeighbors(r, c, rows, cols).forEach(([nr, nc]) => {
        const nIdx = nr * cols + nc;
        if (!board[nIdx].revealed && !board[nIdx].mine) {
          stack.push(nIdx);
        }
      });
    }
  }
  return revealedCount;
}

// ==========================================
// 7. 單機 / 電腦 AI 開局與點擊處理
// ==========================================
function startNewLocalGame() {
  clearTimeout(state.aiTimer);
  const cfg = DIFFICULTIES[state.difficulty];
  state.rows = cfg.rows;
  state.cols = cfg.cols;
  state.totalMines = cfg.mines;
  state.board = generateBoardData(cfg.rows, cfg.cols, cfg.mines);
  state.turn = 1;
  state.scores = { 1: 0, 2: 0 };
  state.combo = 0;
  state.hintsLeft = 2;
  state.gameOver = false;

  state.p1Info = { name: state.user.name, avatar: state.user.avatar };
  state.p2Info =
    state.mode === "ai"
      ? { name: "聰明電腦", avatar: "🤖" }
      : { name: "現場夥伴 2", avatar: "🐰" };

  el.resultModal.classList.add("hidden");
  renderAll();
}

async function handleCellClick(idx) {
  if (state.gameOver) return;
  const cell = state.board[idx];
  if (!cell || cell.revealed) return;

  if (state.mode === "online") {
    if (!state.roomId) {
      appendSystemMsg("⚠️ 請先從上方大廳選擇房間加入，或點擊「建立新房間」！");
      return;
    }
    if (state.p2Info.avatar === "⏳") {
      appendSystemMsg("⏳ 請等對手加入房間後再開始進攻喔！");
      return;
    }
    if (state.turn !== state.myRole) {
      appendSystemMsg("⏳ 現在是對手的回合，請稍等一下喔！");
      return;
    }
    await submitOnlineMove(idx);
    return;
  }

  if (state.mode === "ai" && state.turn === 2) return;
  processLocalMove(idx);
}

function processLocalMove(idx) {
  const cell = state.board[idx];
  if (cell.revealed || state.gameOver) return;

  if (cell.mine) {
    cell.revealed = true;
    cell.owner = state.turn;
    state.scores[state.turn]++;
    state.combo++;

    sfx.playMineScore(state.combo);
    spawnComboEffect(idx, `+1 連擊 x${state.combo}!`);
    el.faceBtn.textContent = "🤩";

    if (state.mode === "ai" && state.turn === 1 && state.combo === 2) {
      appendChatBubble("聰明電腦", "🤖", "哇！你連續猜中兩隻小蜜蜂了，好厲害！", false);
    }

    checkWinCondition();
    renderAll();

    if (!state.gameOver && state.mode === "ai" && state.turn === 2) {
      scheduleAiTurn();
    }
  } else {
    const opened = floodReveal(state.board, idx, state.rows, state.cols);
    sfx.playSafeDig(opened);
    state.combo = 0;
    state.turn = state.turn === 1 ? 2 : 1;
    el.faceBtn.textContent = "😊";
    sfx.playTurnSwitch();
    renderAll();

    if (!state.gameOver && state.mode === "ai" && state.turn === 2) {
      scheduleAiTurn();
    }
  }
}

function scheduleAiTurn() {
  clearTimeout(state.aiTimer);
  state.aiTimer = setTimeout(() => {
    if (state.gameOver || state.turn !== 2) return;
    const pick = chooseAiCell();
    if (pick !== -1) {
      processLocalMove(pick);
    }
  }, 850);
}

function chooseAiCell() {
  const { rows, cols, board } = state;
  for (let i = 0; i < board.length; i++) {
    const c = board[i];
    if (!c.revealed || c.mine || c.adj === 0) continue;
    const r = Math.floor(i / cols);
    const col = i % cols;
    const neighbors = getNeighbors(r, col, rows, cols).map(([nr, nc]) => nr * cols + nc);
    const knownMines = neighbors.filter((n) => board[n].revealed && board[n].mine).length;
    const unrevealed = neighbors.filter((n) => !board[n].revealed);
    if (unrevealed.length > 0 && knownMines + unrevealed.length === c.adj) {
      if (Math.random() < 0.85) {
        return unrevealed[0];
      }
    }
  }
  const hidden = [];
  board.forEach((c, idx) => {
    if (!c.revealed) hidden.push(idx);
  });
  return hidden.length ? hidden[Math.floor(Math.random() * hidden.length)] : -1;
}

function checkWinCondition() {
  const target = Math.floor(state.totalMines / 2) + 1;
  if (state.scores[1] === target - 1 || state.scores[2] === target - 1) {
    sfx.playMatchPointAlert();
  }

  if (state.scores[1] >= target || state.scores[2] >= target) {
    state.gameOver = true;
    state.board.forEach((c) => {
      if (c.mine && !c.revealed) c.revealed = true;
    });
    sfx.playVictoryFanfare();
    el.faceBtn.textContent = "🥳";

    const p1Win = state.scores[1] >= target;
    const winnerName = p1Win ? state.p1Info.name : state.p2Info.name;
    el.resultEmoji.textContent = p1Win ? state.p1Info.avatar : state.p2Info.avatar;
    el.resultTitle.textContent = `🎉 ${winnerName} 獲得勝利！`;
    el.resultDetail.textContent = `${state.p1Info.name} ${state.scores[1]} 顆 🐝  VS  ${state.p2Info.name} ${state.scores[2]} 顆 🐝`;
    el.resultModal.classList.remove("hidden");
  }
}

// ==========================================
// 8. Firebase Firestore 線上開房、一鍵加入與離開偵測
// ==========================================
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createOnlineRoom() {
  if (!db) {
    appendSystemMsg("❌ 尚未連線到 Firestore 資料庫。");
    return;
  }
  await cleanupCurrentRoom(false);
  const cfg = DIFFICULTIES[state.difficulty];
  const roomId = generateRoomCode();
  const initialBoard = generateBoardData(cfg.rows, cfg.cols, cfg.mines);

  const roomData = {
    roomId,
    difficulty: state.difficulty,
    rows: cfg.rows,
    cols: cfg.cols,
    totalMines: cfg.mines,
    boardJson: JSON.stringify(initialBoard),
    turn: 1,
    scores: { 1: 0, 2: 0 },
    combo: 0,
    status: "waiting",
    leftBy: "",
    p1: { uid: state.user.uid, name: state.user.name, avatar: state.user.avatar },
    p2: null,
    nudgeAt: 0,
    nudgeFrom: "",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection("msn_minesweeper_rooms").doc(roomId).set(roomData);
    state.roomId = roomId;
    state.myRole = 1;
    enterOnlineRoomUI(roomId);
    listenToRoom(roomId);
    await sendOnlineChatMessage(`我建立了房間 #${roomId}，正在大廳等待對手加入！🐝`, true);
  } catch (err) {
    console.error(err);
    appendSystemMsg("❌ 建立房間失敗，請檢查 Firestore 安全規則是否允許寫入。");
  }
}

async function joinOnlineRoomById(roomId) {
  if (!db) return;
  try {
    const docRef = db.collection("msn_minesweeper_rooms").doc(roomId);
    const snap = await docRef.get();
    if (!snap.exists) {
      appendSystemMsg("❌ 這個房間已經關閉或不存在囉！");
      return;
    }

    const data = snap.data();
    if (data.status !== "waiting" || (data.p2 && data.p2.uid !== state.user.uid)) {
      appendSystemMsg("⚠️ 慢了一步，這個房間已經有其他玩家加入囉！");
      return;
    }

    await cleanupCurrentRoom(false);
    state.roomId = roomId;
    state.myRole = 2;

    await docRef.update({
      p2: { uid: state.user.uid, name: state.user.name, avatar: state.user.avatar },
      status: "playing",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    enterOnlineRoomUI(roomId);
    listenToRoom(roomId);
    await sendOnlineChatMessage(`${state.user.avatar} ${state.user.name} 進入房間，對戰開始！🔥`, true);
  } catch (err) {
    console.error(err);
    appendSystemMsg("❌ 加入房間發生錯誤，請稍後再試。");
  }
}

function enterOnlineRoomUI(roomId) {
  el.roomLobbyControls.classList.add("hidden");
  el.roomActiveBar.classList.remove("hidden");
  el.displayRoomCode.textContent = roomId;
  el.chatMessages.innerHTML = "";
  el.chatModeLabel.textContent = `房間 #${roomId}`;
}

function returnToLobbyUI() {
  el.roomLobbyControls.classList.remove("hidden");
  el.roomActiveBar.classList.add("hidden");
  el.resultModal.classList.add("hidden");
  el.chatModeLabel.textContent = "線上對戰大廳";
  startNewLocalGame();
}

function listenToRoom(roomId) {
  const roomRef = db.collection("msn_minesweeper_rooms").doc(roomId);

  state.unsubRoom = roomRef.onSnapshot((doc) => {
    if (!doc.exists) {
      handleOpponentLeftRoom("對手");
      return;
    }

    const data = doc.data();

    if (data.status === "closed") {
      const leaverName = data.leftBy || "對手";
      handleOpponentLeftRoom(leaverName);
      return;
    }

    const prevScores = { ...state.scores };
    const prevTurn = state.turn;

    state.difficulty = data.difficulty;
    state.rows = data.rows;
    state.cols = data.cols;
    state.totalMines = data.totalMines;
    state.board = JSON.parse(data.boardJson);
    state.turn = data.turn;
    state.scores = data.scores;
    state.combo = data.combo || 0;
    state.p1Info = data.p1 || { name: "房主", avatar: "🐶" };
    state.p2Info = data.p2 || { name: "等待對手加入...", avatar: "⏳" };

    el.roomStatusText.textContent =
      data.status === "waiting" ? "⏳ 等待對手從大廳加入..." : "🔥 線上對戰進行中！";

    if (data.scores[1] > prevScores[1] || data.scores[2] > prevScores[2]) {
      sfx.playMineScore(state.combo || 1);
    } else if (data.turn !== prevTurn && data.status === "playing") {
      sfx.playTurnSwitch();
    }

    if (data.nudgeAt && data.nudgeAt > state.lastNudgeTs) {
      state.lastNudgeTs = data.nudgeAt;
      triggerWindowShake();
    }

    state.gameOver = false;
    el.resultModal.classList.add("hidden");
    checkWinCondition();
    renderAll();
  });

  state.unsubChat = roomRef
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limitToLast(40)
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const msg = change.doc.data();
          if (msg.isSystem) {
            appendSystemMsg(msg.text);
          } else {
            const isMe = msg.uid === state.user.uid;
            appendChatBubble(msg.name, msg.avatar, msg.text, isMe);
            if (!isMe) sfx.playChatPop();
          }
        }
      });
    });
}

function handleOpponentLeftRoom(leaverName) {
  if (!state.roomId) return;
  if (state.unsubRoom) state.unsubRoom();
  if (state.unsubChat) state.unsubChat();
  state.unsubRoom = null;
  state.unsubChat = null;
  state.roomId = null;

  sfx.playLeaveAlert();
  appendSystemMsg(`👋 對手「${leaverName}」已經離開房間，已為您返回線上大廳！`);

  el.leaveNoticeTitle.textContent = `👋 ${leaverName} 已經離開房間`;
  el.leaveNoticeDesc.textContent = "對戰已結束，系統已為您返回線上大廳，您可以重新建立或加入其他房間！";
  el.leaveNoticeModal.classList.remove("hidden");

  returnToLobbyUI();
}

async function cleanupCurrentRoom(notifyOpponent = true) {
  const currentRoomId = state.roomId;
  if (state.unsubRoom) state.unsubRoom();
  if (state.unsubChat) state.unsubChat();
  state.unsubRoom = null;
  state.unsubChat = null;
  state.roomId = null;

  if (db && currentRoomId && notifyOpponent) {
    try {
      await db.collection("msn_minesweeper_rooms").doc(currentRoomId).update({
        status: "closed",
        leftBy: state.user.name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {}
  }
}

window.addEventListener("beforeunload", () => {
  if (db && state.roomId) {
    db.collection("msn_minesweeper_rooms").doc(state.roomId).update({
      status: "closed",
      leftBy: state.user.name
    });
  }
});

async function submitOnlineMove(idx) {
  const boardCopy = state.board.map((c) => ({ ...c }));
  const cell = boardCopy[idx];
  if (cell.revealed) return;

  let nextTurn = state.turn;
  const nextScores = { ...state.scores };
  let nextCombo = state.combo;

  if (cell.mine) {
    cell.revealed = true;
    cell.owner = state.myRole;
    nextScores[state.myRole]++;
    nextCombo++;
    spawnComboEffect(idx, `+1 連擊 x${nextCombo}!`);
  } else {
    const opened = floodReveal(boardCopy, idx, state.rows, state.cols);
    sfx.playSafeDig(opened);
    nextCombo = 0;
    nextTurn = state.turn === 1 ? 2 : 1;
  }

  await db.collection("msn_minesweeper_rooms").doc(state.roomId).update({
    boardJson: JSON.stringify(boardCopy),
    turn: nextTurn,
    scores: nextScores,
    combo: nextCombo,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function resetOnlineRoomGame() {
  if (!db || !state.roomId) return;
  const cfg = DIFFICULTIES[state.difficulty];
  const freshBoard = generateBoardData(cfg.rows, cfg.cols, cfg.mines);

  await db.collection("msn_minesweeper_rooms").doc(state.roomId).update({
    rows: cfg.rows,
    cols: cfg.cols,
    totalMines: cfg.mines,
    boardJson: JSON.stringify(freshBoard),
    turn: 1,
    scores: { 1: 0, 2: 0 },
    combo: 0,
    status: state.p2Info.avatar !== "⏳" ? "playing" : "waiting",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await sendOnlineChatMessage("🔄 開啟了全新一局對戰！", true);
}

// ==========================================
// 9. 畫面渲染與特效輔助函式
// ==========================================
function renderAll() {
  el.p1Avatar.textContent = state.p1Info.avatar;
  el.p1Name.textContent = state.p1Info.name + (state.mode === "online" && state.myRole === 1 ? " (我)" : "");
  el.p1Score.textContent = state.scores[1];

  el.p2Avatar.textContent = state.p2Info.avatar;
  el.p2Name.textContent = state.p2Info.name + (state.mode === "online" && state.myRole === 2 ? " (我)" : "");
  el.p2Score.textContent = state.scores[2];

  el.p1Card.classList.toggle("active-turn", state.turn === 1);
  el.p2Card.classList.toggle("active-turn", state.turn === 2);

  const foundCount = state.scores[1] + state.scores[2];
  el.remainingMines.textContent = state.totalMines - foundCount;
  el.targetScore.textContent = Math.floor(state.totalMines / 2) + 1;
  el.hintCount.textContent = state.hintsLeft;

  const activePlayer = state.turn === 1 ? state.p1Info.name : state.p2Info.name;
  el.turnBanner.className = `turn-banner ${state.turn === 1 ? "p1-banner" : "p2-banner"}`;
  if (state.mode === "online") {
    if (!state.roomId) {
      el.turnBanner.textContent = "🏠 請從上方大廳選擇房間加入對戰，或點擊「建立新房間」";
    } else if (state.p2Info.avatar === "⏳") {
      el.turnBanner.textContent = "⏳ 房間已開啟！正在等待對手從大廳加入...";
    } else {
      el.turnBanner.textContent =
        state.turn === state.myRole
          ? "⚡ 輪到你進攻啦！快點擊草地找小蜜蜂！"
          : `⏳ 等待 ${activePlayer} 思考中...`;
    }
  } else {
    el.turnBanner.textContent = `🎯 輪到【${activePlayer}】進攻！`;
  }

  el.board.style.gridTemplateColumns = `repeat(${state.cols}, 34px)`;
  el.board.innerHTML = "";

  state.board.forEach((cell, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell";
    btn.dataset.idx = idx;

    if (!cell.revealed) {
      btn.classList.add("hidden-cell");
    } else if (cell.mine) {
      btn.classList.add("revealed", cell.owner === 2 ? "mine-p2" : "mine-p1");
      btn.textContent = "🐝";
    } else {
      btn.classList.add("revealed");
      if (cell.adj > 0) {
        btn.textContent = cell.adj;
        btn.classList.add(`n${cell.adj}`);
      }
    }

    btn.addEventListener("click", () => handleCellClick(idx));
    el.board.appendChild(btn);
  });
}

function spawnComboEffect(idx, text) {
  const cellEl = el.board.children[idx];
  if (!cellEl) return;
  const tag = document.createElement("div");
  tag.className = "combo-float";
  tag.textContent = text;
  tag.style.left = `${cellEl.offsetLeft}px`;
  tag.style.top = `${cellEl.offsetTop}px`;
  el.fxLayer.appendChild(tag);
  setTimeout(() => tag.remove(), 900);
}

function triggerWindowShake() {
  sfx.playNudge();
  el.appWindow.classList.remove("nudge-shake");
  void el.appWindow.offsetWidth;
  el.appWindow.classList.add("nudge-shake");
}

// ==========================================
// 10. 聊天室與按鈕事件綁定
// ==========================================
function appendSystemMsg(text) {
  const div = document.createElement("div");
  div.className = "sys-msg";
  div.textContent = text;
  el.chatMessages.appendChild(div);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function appendChatBubble(name, avatar, text, isMe) {
  const div = document.createElement("div");
  div.className = `chat-bubble ${isMe ? "me" : "other"}`;
  div.innerHTML = `<div class="sender">${avatar} ${escapeHtml(name)}</div><div>${escapeHtml(text)}</div>`;
  el.chatMessages.appendChild(div);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

async function sendOnlineChatMessage(text, isSystem = false) {
  if (!text.trim()) return;
  if (db && state.mode === "online" && state.roomId) {
    await db
      .collection("msn_minesweeper_rooms")
      .doc(state.roomId)
      .collection("messages")
      .add({
        uid: state.user.uid,
        name: state.user.name,
        avatar: state.user.avatar,
        text,
        isSystem,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
  } else {
    appendChatBubble(state.user.name, state.user.avatar, text, true);
    sfx.playChatPop();
    if (state.mode === "ai") {
      setTimeout(() => {
        const replies = ["收到！放馬過來吧 🤖", "這局我一定會找到更多蜜蜂！🐝", "哈哈，小心別被我連擊囉！⚡"];
        appendChatBubble("聰明電腦", "🤖", replies[Math.floor(Math.random() * replies.length)], false);
        sfx.playChatPop();
      }, 650);
    }
  }
}

document.getElementById("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = el.chatInput.value.trim();
  if (!text) return;
  el.chatInput.value = "";
  await sendOnlineChatMessage(text, false);
});

document.querySelectorAll(".sticker-btn").forEach((btn) => {
  btn.addEventListener("click", () => sendOnlineChatMessage(btn.dataset.text, false));
});

function switchGameMode(newMode) {
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === newMode);
  });
  state.mode = newMode;

  if (newMode === "online") {
    el.onlinePanel.classList.remove("hidden");
    returnToLobbyUI();
  } else {
    cleanupCurrentRoom(true);
    el.onlinePanel.classList.add("hidden");
    el.chatModeLabel.textContent = newMode === "ai" ? "電腦陪玩聊天" : "雙人同樂模式";
    startNewLocalGame();
  }
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchGameMode(btn.dataset.mode));
});

document.getElementById("difficulty-select").addEventListener("change", (e) => {
  state.difficulty = e.target.value;
  if (state.mode === "online" && state.roomId) {
    resetOnlineRoomGame();
  } else {
    startNewLocalGame();
  }
});

document.getElementById("btn-nudge").addEventListener("click", async () => {
  triggerWindowShake();
  if (db && state.mode === "online" && state.roomId) {
    await db.collection("msn_minesweeper_rooms").doc(state.roomId).update({
      nudgeAt: Date.now(),
      nudgeFrom: state.user.name
    });
    await sendOnlineChatMessage(`📳 ${state.user.name} 傳送了一個來電震動！`, true);
  } else {
    appendSystemMsg(`📳 你發送了一個來電震動！`);
  }
});

document.getElementById("btn-hint").addEventListener("click", () => {
  if (state.hintsLeft <= 0 || state.gameOver) return;
  const hiddenMines = [];
  state.board.forEach((c, idx) => {
    if (c.mine && !c.revealed) hiddenMines.push(idx);
  });
  if (!hiddenMines.length) return;

  state.hintsLeft--;
  el.hintCount.textContent = state.hintsLeft;
  const pick = hiddenMines[Math.floor(Math.random() * hiddenMines.length)];
  const cellEl = el.board.children[pick];
  if (cellEl) {
    cellEl.classList.add("hint-glow");
    sfx.playChatPop();
    setTimeout(() => cellEl.classList.remove("hint-glow"), 2400);
  }
});

document.getElementById("btn-create-room").addEventListener("click", createOnlineRoom);
document.getElementById("btn-leave-room").addEventListener("click", async () => {
  await cleanupCurrentRoom(true);
  appendSystemMsg("🚪 您已離開房間並返回線上大廳。");
  returnToLobbyUI();
});

document.getElementById("btn-confirm-leave-notice").addEventListener("click", () => {
  el.leaveNoticeModal.classList.add("hidden");
});

const restartHandler = () => {
  if (state.mode === "online" && state.roomId) {
    resetOnlineRoomGame();
  } else {
    startNewLocalGame();
  }
};
el.faceBtn.addEventListener("click", restartHandler);
document.getElementById("btn-restart").addEventListener("click", restartHandler);
document.getElementById("btn-play-again").addEventListener("click", restartHandler);

document.getElementById("btn-sound").addEventListener("click", (e) => {
  sfx.enabled = !sfx.enabled;
  e.target.textContent = sfx.enabled ? "🔊" : "🔇";
});

document.getElementById("btn-rules").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.remove("hidden");
});
document.getElementById("btn-close-rules").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.add("hidden");
});