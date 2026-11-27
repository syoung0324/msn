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
// 2. 刺激動態音效引擎 + 經典 ICQ "Uh-oh!" + 輪到我方鈴聲
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
    } catch (e) {}
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

  playMyTurnBell() {
    this.playTone(783.99, "sine", 0.11, 0, 0.26);
    this.playTone(1046.5, "triangle", 0.22, 0.09, 0.28);
    this.playTone(1318.51, "sine", 0.18, 0.16, 0.16);
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

  playIcqUhOh() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const syllables = [
      { start: 0.0, dur: 0.13, f0: 290, f1: 255, formant: 820 },
      { start: 0.16, dur: 0.21, f0: 365, f1: 315, formant: 640 }
    ];

    syllables.forEach((s) => {
      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(s.f0, now + s.start);
      osc.frequency.exponentialRampToValueAtTime(s.f1, now + s.start + s.dur);

      sub.type = "triangle";
      sub.frequency.setValueAtTime(s.f0 * 2, now + s.start);
      sub.frequency.exponentialRampToValueAtTime(s.f1 * 2, now + s.start + s.dur);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(s.formant, now + s.start);
      filter.Q.setValueAtTime(4.5, now + s.start);

      gain.gain.setValueAtTime(0.001, now + s.start);
      gain.gain.linearRampToValueAtTime(0.36, now + s.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + s.start + s.dur);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + s.start);
      sub.start(now + s.start);
      osc.stop(now + s.start + s.dur);
      sub.stop(now + s.start + s.dur);
    });
  }

  playLeaveAlert() {
    this.playTone(440, "triangle", 0.14, 0, 0.22, 260);
    this.playTone(330, "triangle", 0.22, 0.15, 0.22, 196);
  }
}

const sfx = new ArcadeSoundEngine();

["touchstart", "pointerdown", "click"].forEach((evt) => {
  window.addEventListener(evt, () => sfx.init(), { once: true, passive: true });
});

// ==========================================
// 3. 大頭照渲染輔助（支援 Emoji 與本機上傳照片 DataURL）
// ==========================================
function isImageAvatar(avatar) {
  return typeof avatar === "string" && avatar.startsWith("data:image/");
}

function renderAvatarHtml(avatar, imgClass = "avatar-photo-img") {
  const safeVal = avatar || "🐶";
  if (isImageAvatar(safeVal)) {
    return `<img src="${safeVal}" alt="avatar" class="${imgClass}" />`;
  }
  return escapeHtml(safeVal);
}

function compressLocalPhotoToAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const size = 120;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ==========================================
// 4. 可愛暱稱隨機產生器、連線識別與遊戲全域狀態
// ==========================================
const CUTE_ADJECTIVES = [
  "元氣", "閃電", "草莓", "奶蓋", "星光", "棉花糖",
  "無敵", "快樂", "蜂蜜", "奶油", "彩虹", "超萌",
  "幸運", "布丁", "泡泡", "太陽"
];

const CUTE_ANIMALS = [
  "小蜜蜂", "小柴犬", "小狐狸", "小兔兔", "小熊貓", "小企鵝",
  "小倉鼠", "小貓咪", "小海豹", "小刺蝟", "小水獺", "小柯基"
];

function generateCuteNickname() {
  const adj = CUTE_ADJECTIVES[Math.floor(Math.random() * CUTE_ADJECTIVES.length)];
  const ani = CUTE_ANIMALS[Math.floor(Math.random() * CUTE_ANIMALS.length)];
  return `${adj}${ani}`;
}

function getTabSessionId() {
  try {
    let sid = sessionStorage.getItem("msn_ms_session_id");
    if (!sid) {
      sid = "s_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
      sessionStorage.setItem("msn_ms_session_id", sid);
    }
    return sid;
  } catch (e) {
    return "s_" + Math.random().toString(36).substring(2, 10);
  }
}

const HEARTBEAT_INTERVAL_MS = 8000;
const OFFLINE_TIMEOUT_MS = 22000;

const DIFFICULTIES = {
  easy: { label: "🌱 快樂入門 (8×8)", rows: 8, cols: 8, mines: 15 },
  medium: { label: "🌼 活力進階 (12×12)", rows: 12, cols: 12, mines: 29 },
  hard: { label: "🏆 經典 MSN (16×16)", rows: 16, cols: 16, mines: 51 }
};

const state = {
  user: {
    uid: "u_" + Math.random().toString(36).substring(2, 10),
    sessionId: getTabSessionId(),
    name: "元氣小蜜蜂",
    avatar: "🐶"
  },
  hasEnteredLobby: false,
  mode: "online",
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
  turnToastTimer: null,
  heartbeatTimer: null,
  sweepTimer: null,

  roomId: null,
  myRole: 1,
  roomStatus: "waiting",
  waitingRestartAck: false,
  pendingModeSwitch: null,
  unsubLobby: null,
  unsubLobbyUsers: null,
  unsubLobbyChat: null,
  unsubRoom: null,
  unsubChat: null,
  lastNudgeTs: 0,
  lastRestartReqId: "",
  latestLobbyUsersRaw: [],
  latestWaitingRoomsRaw: [],
  p1Info: { name: "玩家 1", avatar: "🐶" },
  p2Info: { name: "等待加入...", avatar: "⏳" }
};

// ==========================================
// 5. DOM 元素快取
// ==========================================
const el = {
  loginModal: document.getElementById("login-modal"),
  nicknameInput: document.getElementById("nickname-input"),
  avatarPreview: document.getElementById("avatar-preview"),
  avatarUploadBtn: document.getElementById("btn-upload-avatar"),
  avatarFileInput: document.getElementById("avatar-file-input"),
  appWindow: document.getElementById("app-window"),
  userBadge: document.getElementById("user-badge"),
  boardWrapper: document.getElementById("board-wrapper"),
  board: document.getElementById("board"),
  fxLayer: document.getElementById("fx-layer"),
  turnToast: document.getElementById("turn-toast"),
  turnToastCard: document.getElementById("turn-toast-card"),
  turnToastAvatar: document.getElementById("turn-toast-avatar"),
  turnToastTitle: document.getElementById("turn-toast-title"),
  turnToastSub: document.getElementById("turn-toast-sub"),
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
  onlinePlayersList: document.getElementById("online-players-list"),
  onlinePlayersCount: document.getElementById("online-players-count"),
  waitingRoomsList: document.getElementById("waiting-rooms-list"),
  waitingRoomsCount: document.getElementById("waiting-rooms-count"),
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
  leaveNoticeDesc: document.getElementById("leave-notice-desc"),
  confirmLeaveModal: document.getElementById("confirm-leave-modal"),
  restartRequestModal: document.getElementById("restart-request-modal"),
  restartReqTitle: document.getElementById("restart-req-title"),
  restartReqDesc: document.getElementById("restart-req-desc")
};

el.nicknameInput.value = generateCuteNickname();

document.getElementById("btn-random-nickname").addEventListener("click", () => {
  el.nicknameInput.value = generateCuteNickname();
  sfx.playSafeDig(2);
});

// ==========================================
// 6. 螢幕中央「輪到您進攻囉！」可愛快閃對話框
// ==========================================
function showYourTurnPopup(playerName, avatar, teamRole = 1) {
  if (!el.turnToast || state.gameOver) return;
  clearTimeout(state.turnToastTimer);

  el.turnToastAvatar.innerHTML = renderAvatarHtml(avatar || "🐶");
  el.turnToastTitle.textContent = "⚡ 輪到您進攻囉！";
  el.turnToastSub.textContent = `【${playerName}】快點草地抓小蜜蜂 🐝`;

  el.turnToastCard.className = `turn-toast-card ${teamRole === 2 ? "team-p2" : "team-p1"}`;
  el.turnToast.classList.remove("hidden");

  el.turnToastCard.style.animation = "none";
  void el.turnToastCard.offsetWidth;
  el.turnToastCard.style.animation = "";

  sfx.playMyTurnBell();

  state.turnToastTimer = setTimeout(() => {
    el.turnToast.classList.add("hidden");
  }, 1400);
}

// ==========================================
// 7. 自適應螢幕格子尺寸計算（支援 iPhone 16e/SE 至寬螢幕電腦）
// ==========================================
function updateResponsiveCellSize() {
  if (!el.boardWrapper || !el.board) return;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const measuredWidth = el.boardWrapper.clientWidth > 0 ? el.boardWrapper.clientWidth : viewportWidth - 16;
  const wrapperWidth = Math.min(measuredWidth, viewportWidth);

  const isSmallPhone = viewportWidth <= 480;
  const isMobile = viewportWidth <= 768;

  const gap = state.cols >= 16 && isMobile ? 2 : isSmallPhone ? 3 : 4;
  const innerPadding = isSmallPhone ? 12 : isMobile ? 16 : 24;

  const availableWidth = Math.max(200, wrapperWidth - innerPadding);
  const rawSize = Math.floor((availableWidth - gap * (state.cols - 1)) / state.cols);

  const minCell = isSmallPhone ? 16 : 18;
  const maxCell = isMobile ? 42 : 36;
  const cellSize = Math.max(minCell, Math.min(rawSize, maxCell));
  const fontSize = Math.max(10, Math.floor(cellSize * 0.56));

  document.documentElement.style.setProperty("--cell-size", `${cellSize}px`);
  document.documentElement.style.setProperty("--cell-gap", `${gap}px`);
  document.documentElement.style.setProperty("--cell-font", `${fontSize}px`);
  el.board.style.gridTemplateColumns = `repeat(${state.cols}, ${cellSize}px)`;
}

window.addEventListener("resize", updateResponsiveCellSize);
window.addEventListener("orientationchange", () => setTimeout(updateResponsiveCellSize, 180));

// ==========================================
// 8. 登入（Emoji + 上傳本機大頭照）、心跳偵測與自動踢除機制
// ==========================================
document.querySelectorAll(".avatar-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".avatar-btn").forEach((b) => b.classList.remove("active"));
    if (el.avatarUploadBtn) el.avatarUploadBtn.classList.remove("active");
    btn.classList.add("active");
    state.user.avatar = btn.dataset.avatar;
    if (el.avatarPreview) {
      el.avatarPreview.innerHTML = renderAvatarHtml(state.user.avatar);
    }
    sfx.playSafeDig(1);
  });
});

if (el.avatarUploadBtn && el.avatarFileInput) {
  el.avatarUploadBtn.addEventListener("click", () => {
    el.avatarFileInput.click();
  });

  el.avatarFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("請選擇圖片檔案（JPG / PNG / WEBP 等）！");
      return;
    }

    try {
      const compressedDataUrl = await compressLocalPhotoToAvatar(file);
      state.user.avatar = compressedDataUrl;

      document.querySelectorAll(".avatar-btn").forEach((b) => b.classList.remove("active"));
      el.avatarUploadBtn.classList.add("active");

      if (el.avatarPreview) {
        el.avatarPreview.innerHTML = renderAvatarHtml(compressedDataUrl);
      }
      sfx.playSafeDig(3);
    } catch (err) {
      console.error("讀取大頭照失敗：", err);
      alert("照片讀取失敗，請換一張照片試試看！");
    } finally {
      el.avatarFileInput.value = "";
    }
  });
}

async function cleanupPreviousReconnectedSession() {
  if (!db) return;
  try {
    const prevUid = sessionStorage.getItem("msn_ms_prev_uid");
    const prevRoomId = sessionStorage.getItem("msn_ms_prev_room");

    if (prevUid && prevUid !== state.user.uid) {
      await db.collection("msn_minesweeper_lobby_users").doc(prevUid).delete().catch(() => {});
    }
    if (prevRoomId) {
      const roomRef = db.collection("msn_minesweeper_rooms").doc(prevRoomId);
      const snap = await roomRef.get().catch(() => null);
      if (snap && snap.exists) {
        const rData = snap.data();
        if (rData.status === "waiting") {
          await roomRef.delete().catch(() => {});
        } else if (rData.status === "playing") {
          await roomRef.update({
            status: "closed",
            leftBy: rData.p1?.uid === prevUid ? rData.p1?.name : rData.p2?.name || "對手"
          }).catch(() => {});
        }
      }
      sessionStorage.removeItem("msn_ms_prev_room");
    }

    const sameSessionSnap = await db
      .collection("msn_minesweeper_lobby_users")
      .where("sessionId", "==", state.user.sessionId)
      .get();
    sameSessionSnap.forEach((doc) => {
      if (doc.id !== state.user.uid) {
        doc.ref.delete().catch(() => {});
        kickStaleRoomsByHostUid(doc.id);
      }
    });

    sessionStorage.setItem("msn_ms_prev_uid", state.user.uid);
  } catch (e) {}
}

async function kickStaleRoomsByHostUid(hostUid) {
  if (!db || !hostUid) return;
  try {
    const roomsSnap = await db
      .collection("msn_minesweeper_rooms")
      .where("status", "==", "waiting")
      .get();
    roomsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.p1 && data.p1.uid === hostUid) {
        doc.ref.delete().catch(() => {});
      }
    });
  } catch (e) {}
}

async function sweepStaleLobbyEntities() {
  const now = Date.now();
  const validUsers = [];
  const activeUids = new Set([state.user.uid]);

  const seenSessions = new Map();
  if (state.hasEnteredLobby) {
    seenSessions.set(state.user.sessionId, { uid: state.user.uid, lastSeen: now });
  }

  for (const u of state.latestLobbyUsersRaw) {
    if (!u || !u.uid) continue;
    if (u.uid === state.user.uid) continue;

    const isExpired = now - (u.lastSeen || 0) > OFFLINE_TIMEOUT_MS;
    const isDuplicateSession =
      u.sessionId &&
      seenSessions.has(u.sessionId) &&
      seenSessions.get(u.sessionId).uid !== u.uid;

    if (isExpired || isDuplicateSession) {
      if (db) {
        db.collection("msn_minesweeper_lobby_users").doc(u.uid).delete().catch(() => {});
        kickStaleRoomsByHostUid(u.uid);
      }
    } else {
      if (u.sessionId) {
        seenSessions.set(u.sessionId, { uid: u.uid, lastSeen: u.lastSeen || now });
      }
      validUsers.push(u);
      activeUids.add(u.uid);
    }
  }

  const validRooms = [];
  for (const room of state.latestWaitingRoomsRaw) {
    if (!room || !room.roomId) continue;
    const hostUid = room.p1?.uid;
    if (hostUid === state.user.uid) continue;

    const hostLastSeen = room.hostLastSeen || 0;
    const isRoomExpired = hostLastSeen > 0 && now - hostLastSeen > OFFLINE_TIMEOUT_MS;
    const isHostOffline = hostUid && !activeUids.has(hostUid) && now - hostLastSeen > OFFLINE_TIMEOUT_MS;

    if (isRoomExpired || isHostOffline) {
      if (db) {
        db.collection("msn_minesweeper_rooms").doc(room.roomId).delete().catch(() => {});
      }
    } else {
      validRooms.push(room);
    }
  }

  const selfEntry = {
    uid: state.user.uid,
    name: state.user.name,
    avatar: state.user.avatar,
    statusText: state.roomId ? `開房等待中 (#${state.roomId})` : "大廳待機中"
  };

  renderOnlinePlayersList([selfEntry, ...validUsers]);

  el.waitingRoomsCount.textContent = `${validRooms.length} 間等待中`;
  if (validRooms.length > 0) {
    el.lobbyCountBadge.textContent = validRooms.length;
    el.lobbyCountBadge.classList.remove("hidden");
  } else {
    el.lobbyCountBadge.classList.add("hidden");
  }
  renderWaitingRoomsList(validRooms);
}

async function updateLobbyPresence(statusText = "大廳待機中") {
  if (!db || !state.hasEnteredLobby) return;
  const now = Date.now();
  try {
    await db.collection("msn_minesweeper_lobby_users").doc(state.user.uid).set({
      uid: state.user.uid,
      sessionId: state.user.sessionId,
      name: state.user.name,
      avatar: state.user.avatar,
      statusText,
      lastSeen: now
    });

    if (state.roomId && state.myRole === 1 && state.roomStatus === "waiting") {
      await db.collection("msn_minesweeper_rooms").doc(state.roomId).update({
        hostLastSeen: now
      }).catch(() => {});
    }
  } catch (e) {}
}

async function removeLobbyPresence() {
  if (!db) return;
  try {
    await db.collection("msn_minesweeper_lobby_users").doc(state.user.uid).delete();
  } catch (e) {}
}

function listenToLobbyChat() {
  if (!db) return;
  if (state.unsubLobbyChat) {
    state.unsubLobbyChat();
    state.unsubLobbyChat = null;
  }

  el.chatMessages.innerHTML = "";
  appendSystemMsg("📢 已連線至線上大廳公開聊天室，所有大廳玩家都能看到彼此的訊息！");

  let isInitialSnapshot = true;
  state.unsubLobbyChat = db
    .collection("msn_minesweeper_lobby_messages")
    .orderBy("createdAt", "asc")
    .limitToLast(35)
    .onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const msg = change.doc.data();
            if (msg.isSystem) {
              appendSystemMsg(msg.text);
            } else {
              const isMe = msg.uid === state.user.uid;
              appendChatBubble(msg.name, msg.avatar, msg.text, isMe);
              if (!isMe && !isInitialSnapshot) {
                sfx.playIcqUhOh();
              }
            }
          }
        });
        isInitialSnapshot = false;
      },
      (err) => {
        console.warn("大廳聊天室監聽提示：", err);
      }
    );
}

async function enterLobbyHandler() {
  const nick = el.nicknameInput.value.trim();
  state.user.name = nick || generateCuteNickname();
  state.hasEnteredLobby = true;

  el.userBadge.innerHTML = `${renderAvatarHtml(state.user.avatar, "user-badge-img")} ${escapeHtml(state.user.name)}`;

  el.loginModal.classList.add("hidden");
  el.appWindow.classList.remove("hidden");

  try {
    sfx.init();
    sfx.playIcqUhOh();
  } catch (e) {}

  await cleanupPreviousReconnectedSession();
  switchGameMode("online", true);
  requestAnimationFrame(updateResponsiveCellSize);

  try {
    await updateLobbyPresence("大廳待機中");

    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = setInterval(() => {
      if (state.mode === "online" && !state.roomId) {
        updateLobbyPresence("大廳待機中");
      } else if (state.mode === "online" && state.roomId && state.roomStatus === "waiting") {
        updateLobbyPresence(`開房等待中 (#${state.roomId})`);
      }
    }, HEARTBEAT_INTERVAL_MS);

    clearInterval(state.sweepTimer);
    state.sweepTimer = setInterval(() => {
      sweepStaleLobbyEntities();
    }, 5000);

    listenToLobbyUsers();
    listenToWaitingRooms();
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

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.hasEnteredLobby && state.mode === "online") {
    if (!state.roomId) {
      updateLobbyPresence("大廳待機中");
    } else if (state.roomStatus === "waiting") {
      updateLobbyPresence(`開房等待中 (#${state.roomId})`);
    }
    sweepStaleLobbyEntities();
  }
});

function listenToLobbyUsers() {
  if (!db) return;
  if (state.unsubLobbyUsers) state.unsubLobbyUsers();

  state.unsubLobbyUsers = db
    .collection("msn_minesweeper_lobby_users")
    .onSnapshot(
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push(doc.data());
        });
        state.latestLobbyUsersRaw = list;
        sweepStaleLobbyEntities();
      },
      (err) => {
        console.warn("在線人員監聽提示：", err);
      }
    );
}

function renderOnlinePlayersList(users) {
  el.onlinePlayersCount.textContent = `${users.length} 人在線`;
  el.onlinePlayersList.innerHTML = "";

  users.forEach((u) => {
    const isMe = u.uid === state.user.uid;
    const isHosting = String(u.statusText || "").includes("開房");
    const row = document.createElement("div");
    row.className = `lobby-player-row ${isMe ? "is-me" : ""}`;
    row.innerHTML = `
      <div class="lobby-player-left">
        <div class="lobby-player-avatar">${renderAvatarHtml(u.avatar || "🐶")}</div>
        <div class="lobby-player-name">${escapeHtml(u.name || "神秘玩家")}${isMe ? " (我)" : ""}</div>
      </div>
      <span class="lobby-player-status ${isHosting ? "status-hosting" : "status-idle"}">
        ${escapeHtml(u.statusText || "大廳待機中")}
      </span>
    `;
    el.onlinePlayersList.appendChild(row);
  });
}

function listenToWaitingRooms() {
  if (!db) return;
  if (state.unsubLobby) state.unsubLobby();

  state.unsubLobby = db
    .collection("msn_minesweeper_rooms")
    .where("status", "==", "waiting")
    .onSnapshot(
      (snapshot) => {
        const rooms = [];
        snapshot.forEach((doc) => {
          rooms.push(doc.data());
        });
        state.latestWaitingRoomsRaw = rooms;
        sweepStaleLobbyEntities();
      },
      (err) => {
        console.warn("Firestore 監聽提示：", err);
        el.waitingRoomsList.innerHTML =
          '<div class="empty-lobby">⚠️ 無法連線至線上大廳（請檢查 Firestore 安全規則是否允許讀寫）</div>';
      }
    );
}

function renderWaitingRoomsList(rooms) {
  el.waitingRoomsList.innerHTML = "";
  if (rooms.length === 0) {
    el.waitingRoomsList.innerHTML =
      '<div class="empty-lobby">🔍 目前大廳沒有等待中的房間，按右上角「➕ 建立對戰房間」當房主吧！</div>';
    return;
  }

  rooms.forEach((room) => {
    const diffLabel = DIFFICULTIES[room.difficulty]?.label || "🌼 活力進階";
    const card = document.createElement("div");
    card.className = "room-card";
    card.innerHTML = `
      <div class="room-host-info">
        <div class="room-host-avatar">${renderAvatarHtml(room.p1?.avatar || "🐶")}</div>
        <div>
          <div class="room-host-name">房主：${escapeHtml(room.p1?.name || "神秘房主")}</div>
          <div class="room-meta">${diffLabel} ｜ 房號 #${room.roomId}</div>
        </div>
      </div>
      <button type="button" class="btn-join-now">⚔️ 立即加入</button>
    `;
    card.querySelector(".btn-join-now").addEventListener("click", () => {
      joinOnlineRoomById(room.roomId);
    });
    el.waitingRoomsList.appendChild(card);
  });
}

// ==========================================
// 9. 棋盤生成與核心踩地雷邏輯
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
// 10. 單機 / 電腦 AI 開局與點擊處理
// ==========================================
function startNewLocalGame(showStartToast = false) {
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
  if (state.mode === "online") {
    state.p2Info = { name: "等待加入...", avatar: "⏳" };
  } else {
    state.p2Info =
      state.mode === "ai"
        ? { name: "聰明電腦", avatar: "🤖" }
        : { name: "現場夥伴 2", avatar: "🐰" };
  }

  el.resultModal.classList.add("hidden");
  renderAll();
  requestAnimationFrame(updateResponsiveCellSize);

  if (showStartToast && state.mode !== "online") {
    showYourTurnPopup(state.p1Info.name, state.p1Info.avatar, 1);
  }
}

async function handleCellClick(idx) {
  if (state.gameOver) return;
  const cell = state.board[idx];
  if (!cell || cell.revealed) return;

  if (state.mode === "online") {
    if (!state.roomId) {
      appendSystemMsg("⚠️ 請先從上方大廳選擇房間加入，或點擊「➕ 建立對戰房間」！");
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
      sfx.playIcqUhOh();
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
    renderAll();

    if (!state.gameOver) {
      if (state.mode === "ai") {
        if (state.turn === 1) {
          showYourTurnPopup(state.p1Info.name, state.p1Info.avatar, 1);
        } else {
          sfx.playTurnSwitch();
          scheduleAiTurn();
        }
      } else if (state.mode === "local") {
        const nextPlayer = state.turn === 1 ? state.p1Info : state.p2Info;
        showYourTurnPopup(nextPlayer.name, nextPlayer.avatar, state.turn);
      }
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
    const winnerAvatar = p1Win ? state.p1Info.avatar : state.p2Info.avatar;
    el.resultEmoji.innerHTML = renderAvatarHtml(winnerAvatar);
    el.resultTitle.textContent = `🎉 ${winnerName} 獲得勝利！`;
    el.resultDetail.textContent = `${state.p1Info.name} ${state.scores[1]} 顆 🐝  VS  ${state.p2Info.name} ${state.scores[2]} 顆 🐝`;

    if (!state.waitingRestartAck) {
      el.resultModal.classList.remove("hidden");
    }
  }
}

// ==========================================
// 11. Firebase Firestore 線上開房、重開徵求同意與離線確認
// ==========================================
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function isActivelyPlayingOnline() {
  return (
    state.mode === "online" &&
    Boolean(state.roomId) &&
    state.roomStatus === "playing" &&
    state.p2Info.avatar !== "⏳" &&
    !state.gameOver
  );
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
  const now = Date.now();

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
    hostLastSeen: now,
    p1: { uid: state.user.uid, name: state.user.name, avatar: state.user.avatar },
    p2: null,
    restartRequest: null,
    nudgeAt: 0,
    nudgeFrom: "",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection("msn_minesweeper_rooms").doc(roomId).set(roomData);
    state.roomId = roomId;
    state.myRole = 1;
    state.roomStatus = "waiting";
    state.waitingRestartAck = false;
    try {
      sessionStorage.setItem("msn_ms_prev_room", roomId);
    } catch (e) {}

    await updateLobbyPresence(`開房等待中 (#${roomId})`);
    enterOnlineRoomUI(roomId);
    listenToRoom(roomId);
    await sendOnlineChatMessage(`我建立了房間 #${roomId}，正在等待對手加入！🐝`, true);
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
    const now = Date.now();
    if (data.hostLastSeen && now - data.hostLastSeen > OFFLINE_TIMEOUT_MS) {
      await docRef.delete().catch(() => {});
      appendSystemMsg("⚠️ 該房主已離線，系統已自動關閉該房間！");
      return;
    }

    if (data.status !== "waiting" || (data.p2 && data.p2.uid !== state.user.uid)) {
      appendSystemMsg("⚠️ 慢了一步，這個房間已經有其他玩家加入囉！");
      return;
    }

    await cleanupCurrentRoom(false);
    state.roomId = roomId;
    state.myRole = 2;
    state.roomStatus = "playing";
    state.waitingRestartAck = false;
    try {
      sessionStorage.setItem("msn_ms_prev_room", roomId);
    } catch (e) {}

    await docRef.update({
      p2: { uid: state.user.uid, name: state.user.name, avatar: state.user.avatar },
      status: "playing",
      restartRequest: null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await removeLobbyPresence();
    enterOnlineRoomUI(roomId);
    listenToRoom(roomId);
    await sendOnlineChatMessage(`${state.user.name} 進入房間，對戰開始！🔥`, true);
  } catch (err) {
    console.error(err);
    appendSystemMsg("❌ 加入房間發生錯誤，請稍後再試。");
  }
}

function enterOnlineRoomUI(roomId) {
  if (state.unsubLobbyChat) {
    state.unsubLobbyChat();
    state.unsubLobbyChat = null;
  }
  el.roomLobbyControls.classList.add("hidden");
  el.roomActiveBar.classList.remove("hidden");
  el.displayRoomCode.textContent = roomId;
  el.chatMessages.innerHTML = "";
  el.chatModeLabel.textContent = `房間 #${roomId}`;
  requestAnimationFrame(updateResponsiveCellSize);
}

function returnToLobbyUI() {
  try {
    sessionStorage.removeItem("msn_ms_prev_room");
  } catch (e) {}

  el.roomLobbyControls.classList.remove("hidden");
  el.roomActiveBar.classList.add("hidden");
  el.resultModal.classList.add("hidden");
  el.restartRequestModal.classList.add("hidden");
  el.confirmLeaveModal.classList.add("hidden");
  el.chatModeLabel.textContent = "線上對戰大廳";
  state.roomStatus = "waiting";
  state.waitingRestartAck = false;
  updateLobbyPresence("大廳待機中");
  if (db && state.mode === "online") {
    listenToLobbyChat();
  }
  startNewLocalGame(false);
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
    const prevStatus = state.roomStatus;
    const wasGameOver = state.gameOver;

    state.roomStatus = data.status;
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

    if (data.status === "playing" && prevStatus === "waiting") {
      removeLobbyPresence();
    }

    const diffSelect = document.getElementById("difficulty-select");
    if (diffSelect && diffSelect.value !== data.difficulty) {
      diffSelect.value = data.difficulty;
    }

    el.roomStatusText.textContent =
      data.status === "waiting" ? "⏳ 等待對手加入..." : "🔥 對戰進行中！";

    if (data.nudgeAt && data.nudgeAt > state.lastNudgeTs) {
      state.lastNudgeTs = data.nudgeAt;
      triggerWindowShake();
    }

    const req = data.restartRequest;
    if (req && req.status === "pending") {
      if (req.fromUid !== state.user.uid) {
        el.resultModal.classList.add("hidden");
        if (state.lastRestartReqId !== req.id) {
          state.lastRestartReqId = req.id;
          const diffName = DIFFICULTIES[req.difficulty]?.label || "目前難度";
          el.restartReqTitle.textContent = `🔄 ${req.fromName} 希望重新開局`;
          el.restartReqDesc.textContent = `難度：【${diffName}】，是否同意結束目前盤面並重新開始一局？`;
          el.restartRequestModal.classList.remove("hidden");
          sfx.playIcqUhOh();
        }
      }
    } else {
      el.restartRequestModal.classList.add("hidden");
      state.waitingRestartAck = false;
    }

    state.gameOver = false;
    el.resultModal.classList.add("hidden");
    checkWinCondition();
    renderAll();

    const isFreshMatchStart =
      data.status === "playing" &&
      data.scores[1] === 0 &&
      data.scores[2] === 0 &&
      (prevStatus === "waiting" || wasGameOver);

    if (data.scores[1] > prevScores[1] || data.scores[2] > prevScores[2]) {
      sfx.playMineScore(state.combo || 1);
    } else if (!state.gameOver && data.status === "playing") {
      if (isFreshMatchStart && data.turn === state.myRole) {
        const myInfo = state.myRole === 1 ? state.p1Info : state.p2Info;
        showYourTurnPopup(myInfo.name, myInfo.avatar, state.myRole);
      } else if (data.turn !== prevTurn) {
        if (data.turn === state.myRole) {
          const myInfo = state.myRole === 1 ? state.p1Info : state.p2Info;
          showYourTurnPopup(myInfo.name, myInfo.avatar, state.myRole);
        } else {
          sfx.playTurnSwitch();
        }
      }
    }
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
            if (!isMe) sfx.playIcqUhOh();
          }
        }
      });
    });
}

async function requestOnlineRestart(targetDifficulty = state.difficulty) {
  if (!db || !state.roomId) return;

  el.resultModal.classList.add("hidden");

  if (state.p2Info.avatar === "⏳") {
    await executeOnlineRoomReset(targetDifficulty);
    return;
  }

  state.waitingRestartAck = true;
  el.turnBanner.textContent = "⏳ 已送出重新開局請求，等待對手同意中...";

  const reqId = "req_" + Date.now();
  await db.collection("msn_minesweeper_rooms").doc(state.roomId).update({
    restartRequest: {
      id: reqId,
      fromUid: state.user.uid,
      fromName: state.user.name,
      difficulty: targetDifficulty,
      status: "pending"
    }
  });
  await sendOnlineChatMessage(`🔄 ${state.user.name} 提出「重新開局」請求，等待對手同意中...`, true);
}

async function executeOnlineRoomReset(targetDifficulty = state.difficulty) {
  if (!db || !state.roomId) return;
  const cfg = DIFFICULTIES[targetDifficulty] || DIFFICULTIES.medium;
  const freshBoard = generateBoardData(cfg.rows, cfg.cols, cfg.mines);

  state.waitingRestartAck = false;
  el.resultModal.classList.add("hidden");
  el.restartRequestModal.classList.add("hidden");

  await db.collection("msn_minesweeper_rooms").doc(state.roomId).update({
    difficulty: targetDifficulty,
    rows: cfg.rows,
    cols: cfg.cols,
    totalMines: cfg.mines,
    boardJson: JSON.stringify(freshBoard),
    turn: 1,
    scores: { 1: 0, 2: 0 },
    combo: 0,
    restartRequest: null,
    status: state.p2Info.avatar !== "⏳" ? "playing" : "waiting",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await sendOnlineChatMessage("✅ 雙方同意重新開局，全新一局開始！", true);
}

function handleOpponentLeftRoom(leaverName) {
  if (!state.roomId) return;
  if (state.unsubRoom) state.unsubRoom();
  if (state.unsubChat) state.unsubChat();
  state.unsubRoom = null;
  state.unsubChat = null;
  state.roomId = null;
  state.waitingRestartAck = false;

  sfx.playLeaveAlert();

  el.leaveNoticeTitle.textContent = `👋 ${leaverName} 已經離開房間`;
  el.leaveNoticeDesc.textContent = "對戰已結束，系統已為您返回線上大廳，您可以重新建立或加入其他房間！";
  el.leaveNoticeModal.classList.remove("hidden");

  returnToLobbyUI();
  appendSystemMsg(`👋 對手「${leaverName}」已經離開房間，已為您返回線上大廳！`);
}

async function cleanupCurrentRoom(notifyOpponent = true) {
  const currentRoomId = state.roomId;
  const wasWaitingOnly = state.roomStatus === "waiting" && state.p2Info.avatar === "⏳";

  if (state.unsubRoom) state.unsubRoom();
  if (state.unsubChat) state.unsubChat();
  state.unsubRoom = null;
  state.unsubChat = null;
  state.roomId = null;
  state.roomStatus = "waiting";
  state.waitingRestartAck = false;

  try {
    sessionStorage.removeItem("msn_ms_prev_room");
  } catch (e) {}

  if (db && currentRoomId && notifyOpponent) {
    try {
      const roomRef = db.collection("msn_minesweeper_rooms").doc(currentRoomId);
      if (wasWaitingOnly) {
        await roomRef.delete();
      } else {
        await roomRef.update({
          status: "closed",
          leftBy: state.user.name,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (e) {}
  }
}

function handleUnloadCleanup() {
  if (!db) return;
  db.collection("msn_minesweeper_lobby_users").doc(state.user.uid).delete().catch(() => {});
  if (state.roomId) {
    const roomRef = db.collection("msn_minesweeper_rooms").doc(state.roomId);
    if (state.roomStatus === "waiting" && state.p2Info.avatar === "⏳") {
      roomRef.delete().catch(() => {});
    } else {
      roomRef.update({
        status: "closed",
        leftBy: state.user.name
      }).catch(() => {});
    }
  }
}

window.addEventListener("beforeunload", handleUnloadCleanup);
window.addEventListener("pagehide", handleUnloadCleanup);

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

// ==========================================
// 12. 畫面渲染與特效輔助函式
// ==========================================
function renderAll() {
  el.p1Avatar.innerHTML = renderAvatarHtml(state.p1Info.avatar);
  el.p1Name.textContent = state.p1Info.name + (state.mode === "online" && state.myRole === 1 ? " (我)" : "");
  el.p1Score.textContent = state.scores[1];

  el.p2Avatar.innerHTML = renderAvatarHtml(state.p2Info.avatar);
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
      el.turnBanner.textContent = "🏠 請從上方大廳點選房間加入，或按「➕ 建立對戰房間」";
    } else if (state.p2Info.avatar === "⏳") {
      el.turnBanner.textContent = "⏳ 房間已開啟！等待對手從大廳加入...";
    } else if (state.waitingRestartAck) {
      el.turnBanner.textContent = "⏳ 已送出重新開局請求，等待對手同意中...";
    } else if (state.gameOver) {
      el.turnBanner.textContent = "🏆 本局已結束！點擊下方「🔄 重新一局」可邀請再戰";
    } else {
      el.turnBanner.textContent =
        state.turn === state.myRole
          ? "⚡ 輪到你進攻啦！快點草地找小蜜蜂！"
          : `⏳ 等待 ${activePlayer} 思考中...`;
    }
  } else {
    el.turnBanner.textContent = `🎯 輪到【${activePlayer}】進攻！`;
  }

  updateResponsiveCellSize();
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
// 13. LINE 風格聊天室與按鈕事件綁定
// ==========================================
function appendSystemMsg(text) {
  const div = document.createElement("div");
  div.className = "sys-msg";
  div.textContent = text;
  el.chatMessages.appendChild(div);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function appendChatBubble(name, avatar, text, isMe) {
  const row = document.createElement("div");
  row.className = `chat-row ${isMe ? "me" : "other"}`;

  if (isMe) {
    row.innerHTML = `
      <div class="chat-content-col">
        <div class="chat-sender-name">${escapeHtml(name)}</div>
        <div class="chat-bubble me">${escapeHtml(text)}</div>
      </div>
    `;
  } else {
    row.innerHTML = `
      <div class="chat-avatar">${renderAvatarHtml(avatar)}</div>
      <div class="chat-content-col">
        <div class="chat-sender-name">${escapeHtml(name)}</div>
        <div class="chat-bubble other">${escapeHtml(text)}</div>
      </div>
    `;
  }

  el.chatMessages.appendChild(row);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

async function sendOnlineChatMessage(text, isSystem = false) {
  if (!text.trim()) return;

  if (db && state.mode === "online") {
    const payload = {
      uid: state.user.uid,
      name: state.user.name,
      avatar: state.user.avatar,
      text,
      isSystem,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (state.roomId) {
        await db
          .collection("msn_minesweeper_rooms")
          .doc(state.roomId)
          .collection("messages")
          .add(payload);
      } else {
        await db.collection("msn_minesweeper_lobby_messages").add(payload);
      }
    } catch (err) {
      console.error("發送線上訊息失敗：", err);
      appendSystemMsg("⚠️ 訊息傳送失敗，請確認網路或 Firestore 權限設定。");
    }
  } else {
    appendChatBubble(state.user.name, state.user.avatar, text, true);
    sfx.playIcqUhOh();
    if (state.mode === "ai") {
      setTimeout(() => {
        const replies = ["收到！放馬過來吧 🤖", "這局我一定會找到更多蜜蜂！🐝", "哈哈，小心別被我連擊囉！⚡"];
        appendChatBubble("聰明電腦", "🤖", replies[Math.floor(Math.random() * replies.length)], false);
        sfx.playIcqUhOh();
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

function switchGameMode(newMode, skipConfirm = false) {
  if (!skipConfirm && newMode !== state.mode && isActivelyPlayingOnline()) {
    state.pendingModeSwitch = newMode;
    el.confirmLeaveModal.classList.remove("hidden");
    return;
  }

  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === newMode);
  });
  state.mode = newMode;

  if (newMode === "online") {
    el.onlinePanel.classList.remove("hidden");
    returnToLobbyUI();
  } else {
    if (state.unsubLobbyChat) {
      state.unsubLobbyChat();
      state.unsubLobbyChat = null;
    }
    cleanupCurrentRoom(true);
    removeLobbyPresence();
    el.onlinePanel.classList.add("hidden");
    el.chatMessages.innerHTML = "";
    appendSystemMsg(newMode === "ai" ? "已切換至電腦互動模式，快來挑戰吧！" : "已切換至雙人同樂模式！");
    el.chatModeLabel.textContent = newMode === "ai" ? "電腦陪玩聊天" : "雙人同樂模式";
    startNewLocalGame(true);
  }
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchGameMode(btn.dataset.mode));
});

document.getElementById("difficulty-select").addEventListener("change", (e) => {
  const newDiff = e.target.value;
  if (state.mode === "online" && state.roomId) {
    requestOnlineRestart(newDiff);
  } else {
    state.difficulty = newDiff;
    startNewLocalGame(true);
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
  } else if (db && state.mode === "online" && !state.roomId) {
    await sendOnlineChatMessage(`📳 ${state.user.name} 在大廳發送了一個來電震動！`, true);
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
    sfx.playIcqUhOh();
    setTimeout(() => cellEl.classList.remove("hint-glow"), 2400);
  }
});

document.getElementById("btn-create-room").addEventListener("click", createOnlineRoom);

document.getElementById("btn-leave-room").addEventListener("click", async () => {
  if (isActivelyPlayingOnline()) {
    state.pendingModeSwitch = null;
    el.confirmLeaveModal.classList.remove("hidden");
  } else {
    await cleanupCurrentRoom(true);
    returnToLobbyUI();
    appendSystemMsg("🚪 您已離開房間並返回線上大廳。");
  }
});

document.getElementById("btn-cancel-leave").addEventListener("click", () => {
  state.pendingModeSwitch = null;
  el.confirmLeaveModal.classList.add("hidden");
});

document.getElementById("btn-confirm-leave").addEventListener("click", async () => {
  el.confirmLeaveModal.classList.add("hidden");
  const targetMode = state.pendingModeSwitch;
  state.pendingModeSwitch = null;

  await cleanupCurrentRoom(true);
  if (targetMode && targetMode !== "online") {
    switchGameMode(targetMode, true);
  } else {
    returnToLobbyUI();
    appendSystemMsg("🚪 您已離開房間並返回線上大廳。");
  }
});

document.getElementById("btn-confirm-leave-notice").addEventListener("click", () => {
  el.leaveNoticeModal.classList.add("hidden");
});

document.getElementById("btn-accept-restart").addEventListener("click", async () => {
  el.restartRequestModal.classList.add("hidden");
  el.resultModal.classList.add("hidden");
  if (!db || !state.roomId) return;
  const snap = await db.collection("msn_minesweeper_rooms").doc(state.roomId).get();
  const reqDiff = snap.data()?.restartRequest?.difficulty || state.difficulty;
  await executeOnlineRoomReset(reqDiff);
});

document.getElementById("btn-reject-restart").addEventListener("click", async () => {
  el.restartRequestModal.classList.add("hidden");
  if (!db || !state.roomId) return;
  await db.collection("msn_minesweeper_rooms").doc(state.roomId).update({
    restartRequest: null
  });
  await sendOnlineChatMessage(`❌ ${state.user.name} 婉拒了重新開局請求！`, true);
});

const restartHandler = () => {
  el.resultModal.classList.add("hidden");
  if (state.mode === "online" && state.roomId) {
    requestOnlineRestart(state.difficulty);
  } else {
    startNewLocalGame(true);
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