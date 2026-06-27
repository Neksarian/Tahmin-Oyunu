const socket = io();

// State variables
let roomCode = null;
let playerName = null;
let roomState = null;
let isHost = false;
let toastTimeout = null;
let localCustomQuestions = [];

// DOM Elements
const globalGameInfo = document.getElementById('global-game-info');
const headerRoomCode = document.getElementById('header-room-code');
const headerRoundInfo = document.getElementById('header-round-info');
const errorToast = document.getElementById('error-toast');
const errorToastText = document.getElementById('error-toast-text');

// Screens
const screens = {
  auth: document.getElementById('screen-auth'),
  lobby: document.getElementById('screen-lobby'),
  question: document.getElementById('screen-question'),
  discussion: document.getElementById('screen-discussion'),
  voting: document.getElementById('screen-voting'),
  results: document.getElementById('screen-results'),
  ended: document.getElementById('screen-ended')
};

// --- HELPER FUNCTIONS ---

function showScreen(screenKey) {
  // Hide all screens
  Object.values(screens).forEach(screen => {
    screen.classList.add('hidden');
  });
  // Show target screen
  if (screens[screenKey]) {
    screens[screenKey].classList.remove('hidden');
  }

  // Header display rules
  if (screenKey === 'auth') {
    globalGameInfo.classList.add('hidden');
  } else {
    globalGameInfo.classList.remove('hidden');
  }
}

function showToast(message) {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  errorToastText.textContent = message;
  errorToast.classList.remove('hidden');
  
  toastTimeout = setTimeout(() => {
    errorToast.classList.add('hidden');
  }, 4000);
}

// Copy Code Helper
document.getElementById('btn-copy-code').addEventListener('click', () => {
  if (roomCode) {
    navigator.clipboard.writeText(roomCode)
      .then(() => showToast('Oda kodu kopyalandı!'))
      .catch(() => showToast('Kod kopyalanamadı.'));
  }
});

// --- AUTH TAB TOGGLES ---
const btnTabJoin = document.getElementById('btn-tab-join');
const btnTabCreate = document.getElementById('btn-tab-create');
const joinRoomContainer = document.getElementById('join-room-container');
const createRoomContainer = document.getElementById('create-room-container');

btnTabJoin.addEventListener('click', () => {
  btnTabJoin.className = 'py-2.5 rounded-lg text-xs font-bold border border-purple-500/20 bg-purple-500/10 text-purple-300 transition-all';
  btnTabCreate.className = 'py-2.5 rounded-lg text-xs font-bold border border-white/5 bg-white/5 text-slate-400 transition-all';
  joinRoomContainer.classList.remove('hidden');
  createRoomContainer.classList.add('hidden');
});

btnTabCreate.addEventListener('click', () => {
  btnTabCreate.className = 'py-2.5 rounded-lg text-xs font-bold border border-purple-500/20 bg-purple-500/10 text-purple-300 transition-all';
  btnTabJoin.className = 'py-2.5 rounded-lg text-xs font-bold border border-white/5 bg-white/5 text-slate-400 transition-all';
  createRoomContainer.classList.remove('hidden');
  joinRoomContainer.classList.add('hidden');
});


// --- INITIAL WORK / RECONNECT ---
window.addEventListener('DOMContentLoaded', () => {
  const savedSession = localStorage.getItem('tahminim_session');
  if (savedSession) {
    try {
      const { code, name } = JSON.parse(savedSession);
      if (code && name) {
        console.log(`Reconnecting to room ${code} as ${name}...`);
        socket.emit('room:reconnect', { roomCode: code, name });
      }
    } catch (e) {
      localStorage.removeItem('tahminim_session');
    }
  }
  showScreen('auth');
});


// --- BUTTON EVENT LISTENERS ---

// Create Room Action
document.getElementById('btn-create-room').addEventListener('click', () => {
  const name = document.getElementById('input-nickname').value.trim();
  if (!name) {
    return showToast('Lütfen oyuncu adı girin.');
  }
  playerName = name;
  socket.emit('room:create', { hostName: name });
});

// Join Room Action
document.getElementById('btn-join-room').addEventListener('click', () => {
  const name = document.getElementById('input-nickname').value.trim();
  const code = document.getElementById('input-room-code').value.trim().toUpperCase();
  if (!name) {
    return showToast('Lütfen oyuncu adı girin.');
  }
  if (!code || code.length !== 4) {
    return showToast('Lütfen 4 haneli geçerli oda kodunu girin.');
  }
  playerName = name;
  roomCode = code;
  socket.emit('room:join', { roomCode: code, name });
});

// Start Game (Host only)
document.getElementById('btn-start-game').addEventListener('click', () => {
  const rounds = document.getElementById('select-rounds').value;
  const imposterCount = document.getElementById('select-imposters').value;
  const useOnlyCustom = document.getElementById('checkbox-use-only-custom').checked;
  socket.emit('game:start', { 
    roomCode, 
    rounds, 
    imposterCount, 
    customQuestions: localCustomQuestions, 
    useOnlyCustom 
  });
});

// Custom Questions UI Handling
const btnToggleCustom = document.getElementById('btn-toggle-custom-questions');
const customQuestionsPanel = document.getElementById('custom-questions-panel');
const customChevron = document.getElementById('custom-questions-chevron');

if (btnToggleCustom && customQuestionsPanel) {
  btnToggleCustom.addEventListener('click', () => {
    const isHidden = customQuestionsPanel.classList.contains('hidden');
    if (isHidden) {
      customQuestionsPanel.classList.remove('hidden');
      customChevron.style.transform = 'rotate(180deg)';
    } else {
      customQuestionsPanel.classList.add('hidden');
      customChevron.style.transform = 'rotate(0deg)';
    }
  });
}

document.getElementById('btn-add-custom-question').addEventListener('click', () => {
  const textInput = document.getElementById('input-custom-question-text');
  const clueInput = document.getElementById('input-custom-question-clue');
  const text = textInput.value.trim();
  const clue = clueInput.value.trim();

  if (!text || !clue) {
    return showToast('Lütfen hem soru metnini hem de ipucunu doldurun.');
  }

  localCustomQuestions.push({
    id: Date.now() + Math.random(),
    text,
    imposterClue: clue
  });

  textInput.value = '';
  clueInput.value = '';
  updateCustomQuestionsUI();
});

function updateCustomQuestionsUI() {
  const list = document.getElementById('custom-questions-list');
  const countLabel = document.getElementById('custom-questions-count');
  
  if (!list || !countLabel) return;
  
  if (localCustomQuestions.length === 0) {
    list.innerHTML = `<p id="custom-questions-empty-text" class="text-[10px] text-slate-500 italic py-1 text-center">Henüz özel soru eklenmedi.</p>`;
    countLabel.textContent = '0 Soru';
    return;
  }

  countLabel.textContent = `${localCustomQuestions.length} Soru`;
  list.innerHTML = '';
  
  localCustomQuestions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 text-[10px]';
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'flex flex-col gap-0.5 text-left pr-2 overflow-hidden w-[85%]';
    
    const qText = document.createElement('span');
    qText.className = 'font-semibold text-slate-200 truncate';
    qText.textContent = `${idx + 1}. ${q.text}`;
    
    const qClue = document.createElement('span');
    qClue.className = 'text-slate-400 truncate text-[9px]';
    qClue.textContent = q.imposterClue;

    infoDiv.appendChild(qText);
    infoDiv.appendChild(qClue);

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'text-red-400 hover:text-red-300 transition-colors pl-1';
    btnDel.innerHTML = '<i class="fa-solid fa-trash"></i>';
    btnDel.addEventListener('click', () => {
      localCustomQuestions.splice(idx, 1);
      updateCustomQuestionsUI();
    });

    item.appendChild(infoDiv);
    item.appendChild(btnDel);
    list.appendChild(item);
  });
}

// Submit Answer
document.getElementById('btn-submit-answer').addEventListener('click', () => {
  const input = document.getElementById('input-answer');
  const val = input.value.trim();
  if (val === '' || isNaN(Number(val))) {
    return showToast('Lütfen geçerli bir sayı girin.');
  }
  socket.emit('game:submit_answer', { roomCode, answer: val });
  input.value = ''; // Clear input
});

// Next Round (Host only)
document.getElementById('btn-next-round').addEventListener('click', () => {
  socket.emit('game:next_round', { roomCode });
});

// Restart Lobby (Host only)
document.getElementById('btn-restart-lobby').addEventListener('click', () => {
  socket.emit('game:reset_lobby', { roomCode });
});


// --- SOCKET EVENT LISTENERS ---

socket.on('connect', () => {
  console.log('Connected to socket server.');
});

socket.on('error:msg', (msg) => {
  showToast(msg);
});

socket.on('room:created', ({ roomCode: code, room }) => {
  roomCode = code;
  localStorage.setItem('tahminim_session', JSON.stringify({ code, name: playerName }));
  showScreen('lobby');
});

socket.on('room:joined', ({ roomCode: code, room }) => {
  roomCode = code;
  localStorage.setItem('tahminim_session', JSON.stringify({ code, name: playerName }));
  showScreen('lobby');
});

socket.on('room:reconnected', ({ roomCode: code, room }) => {
  roomCode = code;
  // If player reconnected successfully, set variables
  const player = room.players.find(p => p.socketId === socket.id);
  if (player) {
    playerName = player.name;
  }
  localStorage.setItem('tahminim_session', JSON.stringify({ code, name: playerName }));
  showToast('Başarıyla yeniden bağlanıldı!');
});

// Primary Game State Router
socket.on('room:updated', (room) => {
  roomState = room;
  isHost = (room.hostId === socket.id);

  // Find self
  const me = room.players.find(p => p.name === playerName || p.socketId === socket.id);
  if (me) {
    // Keep name in sync in case of socket changes
    playerName = me.name; 
  }

  // Update navbar layout overlays
  headerRoomCode.textContent = `ODA: ${room.roomCode}`;
  if (room.status !== 'lobby' && room.status !== 'ended') {
    headerRoundInfo.textContent = `Tur: ${room.currentRound} / ${room.config.rounds}`;
  } else {
    headerRoundInfo.textContent = 'Tur: -- / --';
  }

  // Route to screens
  switch (room.status) {
    case 'lobby':
      renderLobby(room);
      showScreen('lobby');
      break;
    case 'question':
      renderQuestion(room, me);
      showScreen('question');
      break;
    case 'discussion':
      renderDiscussion(room, me);
      showScreen('discussion');
      break;
    case 'voting':
      renderVoting(room, me);
      showScreen('voting');
      break;
    case 'results':
      renderResults(room, me);
      showScreen('results');
      break;
    case 'ended':
      renderEnded(room, me);
      showScreen('ended');
      break;
  }
});

// Clock synchronization
socket.on('timer:tick', ({ seconds, status }) => {
  const textVal = Math.max(0, seconds);
  
  if (status === 'discussion') {
    const timerValue = document.getElementById('discussion-timer-value');
    const timerBar = document.getElementById('discussion-timer-bar');
    if (timerValue && timerBar) {
      timerValue.textContent = textVal;
      // Formula: circumference * (1 - current / max)
      const offset = 238.76 * (1 - textVal / 60);
      timerBar.style.strokeDashoffset = offset;
    }
  } else if (status === 'voting') {
    const timerValue = document.getElementById('voting-timer-value');
    const timerBar = document.getElementById('voting-timer-bar');
    if (timerValue && timerBar) {
      timerValue.textContent = textVal;
      const offset = 238.76 * (1 - textVal / 30);
      timerBar.style.strokeDashoffset = offset;
    }
  }
});


// --- RENDER FUNCTIONS FOR SCREENS ---

// Render: Screen LOBBY
function renderLobby(room) {
  const codeDisplay = document.getElementById('lobby-code-display');
  const countDisplay = document.getElementById('lobby-count-display');
  const playersList = document.getElementById('lobby-players-list');
  const hostSettings = document.getElementById('host-settings-container');
  const nonHostWait = document.getElementById('non-host-wait-container');

  codeDisplay.textContent = room.roomCode;
  countDisplay.textContent = `${room.players.length} Oyuncu`;

  // Render players
  playersList.innerHTML = '';
  room.players.forEach(p => {
    const isThisHost = room.hostId === p.socketId;
    const isMe = p.name === playerName;
    
    const item = document.createElement('div');
    item.className = `flex items-center justify-between p-3 rounded-xl border ${isMe ? 'bg-purple-950/20 border-purple-500/30' : 'bg-white/5 border-white/5'}`;
    
    // Left side: Connection status icon & Name
    const leftDiv = document.createElement('div');
    leftDiv.className = 'flex items-center gap-2.5';
    
    const statusDot = document.createElement('span');
    statusDot.className = `w-2 h-2 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'text-sm font-semibold text-slate-100';
    nameSpan.textContent = p.name + (isMe ? ' (Siz)' : '');
    
    leftDiv.appendChild(statusDot);
    leftDiv.appendChild(nameSpan);
    
    // Right side: crown icon if host, or offline label
    const rightDiv = document.createElement('div');
    rightDiv.className = 'flex items-center gap-2';

    if (!p.connected) {
      const offlineLabel = document.createElement('span');
      offlineLabel.className = 'text-[10px] text-red-400 font-bold bg-red-950/50 px-2 py-0.5 rounded';
      offlineLabel.textContent = 'Bağlantı Koptu';
      rightDiv.appendChild(offlineLabel);
    }
    
    if (isThisHost) {
      const crown = document.createElement('i');
      crown.className = 'fa-solid fa-crown text-amber-400 text-sm';
      rightDiv.appendChild(crown);
    }

    item.appendChild(leftDiv);
    item.appendChild(rightDiv);
    playersList.appendChild(item);
  });

  // Handle configuration display
  if (isHost) {
    hostSettings.classList.remove('hidden');
    nonHostWait.classList.add('hidden');
  } else {
    hostSettings.classList.add('hidden');
    nonHostWait.classList.remove('hidden');
  }
}

// Render: Screen QUESTION
function renderQuestion(room, me) {
  const banner = document.getElementById('role-identity-banner');
  const questionText = document.getElementById('display-question-text');
  const formContainer = document.getElementById('answer-form-container');
  const waitingContainer = document.getElementById('answer-waiting-container');
  const statusList = document.getElementById('answer-status-list');

  if (!me) return;

  const isImposter = room.imposters.includes(me.socketId);

  // Identity alert box setup
  banner.innerHTML = '';
  if (isImposter) {
    banner.className = 'mb-6 p-4 rounded-xl border border-red-500/20 bg-red-950/20 flex items-center gap-3 animate-pulse-slow';
    banner.innerHTML = `
      <i class="fa-solid fa-user-secret text-red-500 text-2xl"></i>
      <div>
        <h4 class="text-sm font-bold text-red-400 tracking-wide">ROLÜN: IMPOSTER</h4>
        <p class="text-xs text-red-200/80 mt-0.5">Asıl soruyu bilmiyorsun. Aşağıdaki sayısal ipucuna göre kamufle olan bir tahminde bulun!</p>
      </div>
    `;
    questionText.className = 'text-lg md:text-xl font-medium leading-relaxed text-red-200 imposter-glow';
    questionText.textContent = room.currentQuestion.imposterClue;
  } else {
    banner.className = 'mb-6 p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 flex items-center gap-3';
    banner.innerHTML = `
      <i class="fa-solid fa-shield-halved text-emerald-500 text-2xl"></i>
      <div>
        <h4 class="text-sm font-bold text-emerald-400 tracking-wide">ROLÜN: MASUM</h4>
        <p class="text-xs text-emerald-200/80 mt-0.5">Soruyu en doğru şekilde cevapla ve tartışmada Imposter'ın yalanlarını yakala.</p>
      </div>
    `;
    questionText.className = 'text-lg md:text-xl font-medium leading-relaxed text-emerald-100';
    questionText.textContent = `Soru: ${room.currentQuestion.text}`;
  }

  // Answer submit form transitions
  if (me.answered) {
    formContainer.classList.add('hidden');
    waitingContainer.classList.remove('hidden');

    // Render who has answered status bullets
    statusList.innerHTML = '';
    room.players.forEach(p => {
      if (p.isAlive) {
        const pill = document.createElement('span');
        pill.className = `px-3 py-1 rounded-full text-xs font-semibold ${p.answered ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' : 'bg-white/5 border border-white/10 text-slate-400'}`;
        pill.textContent = p.name;
        statusList.appendChild(pill);
      }
    });
  } else {
    formContainer.classList.remove('hidden');
    waitingContainer.classList.add('hidden');
  }
}

// Render: Screen DISCUSSION
function renderDiscussion(room, me) {
  const realQuestionText = document.getElementById('discussion-real-question');
  const answersList = document.getElementById('discussion-answers-list');

  realQuestionText.textContent = room.currentQuestion.text;

  // Render answers list
  answersList.innerHTML = '';
  room.players.forEach(p => {
    if (p.isAlive) {
      const isMe = p.name === playerName;
      const card = document.createElement('div');
      card.className = `p-4 rounded-2xl glass-panel answer-card flex flex-col justify-between gap-3 ${isMe ? 'border-purple-500/40 bg-purple-950/10' : 'border-white/5'}`;

      // User header
      const userDiv = document.createElement('div');
      userDiv.className = 'flex items-center justify-between border-b border-white/5 pb-2';
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'flex items-center gap-2';

      const statusDot = document.createElement('span');
      statusDot.className = `w-1.5 h-1.5 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-red-500'}`;
      
      const userSpan = document.createElement('span');
      userSpan.className = 'text-xs font-semibold text-slate-300';
      userSpan.textContent = p.name + (isMe ? ' (Siz)' : '');
      
      nameDiv.appendChild(statusDot);
      nameDiv.appendChild(userSpan);
      
      userDiv.appendChild(nameDiv);

      if (!p.connected) {
        const discIcon = document.createElement('i');
        discIcon.className = 'fa-solid fa-wifi-slash text-red-500 text-xs';
        userDiv.appendChild(discIcon);
      }

      // Value block
      const valDiv = document.createElement('div');
      valDiv.className = 'text-center py-1';
      
      const answerVal = document.createElement('h4');
      answerVal.className = 'text-2xl font-black text-white tracking-wide';
      answerVal.textContent = (p.answer !== null && p.answer !== undefined) ? p.answer : 'Cevap yok';
      
      valDiv.appendChild(answerVal);

      card.appendChild(userDiv);
      card.appendChild(valDiv);
      answersList.appendChild(card);
    }
  });
}

// Render: Screen VOTING
function renderVoting(room, me) {
  const alertBox = document.getElementById('voter-status-alert');
  const choicesContainer = document.getElementById('voting-choices-container');
  const waitingArea = document.getElementById('vote-waiting-area');

  if (!me) return;

  // Reset display
  alertBox.classList.add('hidden');
  choicesContainer.classList.add('hidden');
  waitingArea.classList.add('hidden');

  if (!me.isAlive) {
    // Spectator view
    alertBox.classList.remove('hidden');
    alertBox.className = 'mb-6 p-4 rounded-xl border border-red-500/20 bg-red-950/20 flex items-center gap-3';
    alertBox.innerHTML = `
      <i class="fa-solid fa-ghost text-red-400 text-2xl"></i>
      <div>
        <h4 class="text-sm font-bold text-red-400">Elediniz / İzleyici Modu</h4>
        <p class="text-xs text-red-200/80 mt-0.5">Oylamada yer alamazsınız. Diğer oyuncuların tartışmayı sonuçlandırmasını bekleyin.</p>
      </div>
    `;
    waitingArea.classList.remove('hidden');
    return;
  }

  if (me.voted) {
    waitingArea.classList.remove('hidden');
  } else {
    choicesContainer.classList.remove('hidden');
    choicesContainer.innerHTML = '';

    // Render list of other alive players to vote on
    const aliveOthers = room.players.filter(p => p.isAlive && p.socketId !== me.socketId);
    
    if (aliveOthers.length === 0) {
      choicesContainer.innerHTML = `<p class="text-xs text-center text-slate-400 py-4">Oylanacak diğer oyuncu bulunamadı.</p>`;
      return;
    }

    aliveOthers.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'w-full flex items-center justify-between p-4 rounded-2xl glass-panel border border-white/5 hover:border-red-500/30 hover:bg-red-950/10 text-left transition-all group';
      
      const innerDiv = document.createElement('div');
      innerDiv.className = 'flex items-center gap-3';
      
      const avatarIcon = document.createElement('i');
      avatarIcon.className = 'fa-solid fa-circle-user text-slate-500 group-hover:text-red-400 text-lg transition-colors';
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'text-sm font-semibold text-white group-hover:text-red-200 transition-colors';
      nameSpan.textContent = p.name;

      innerDiv.appendChild(avatarIcon);
      innerDiv.appendChild(nameSpan);

      const actionIcon = document.createElement('i');
      actionIcon.className = 'fa-solid fa-crosshairs text-slate-500 group-hover:text-red-500 text-sm transition-all group-hover:scale-110';

      btn.appendChild(innerDiv);
      btn.appendChild(actionIcon);

      btn.addEventListener('click', () => {
        socket.emit('game:submit_vote', { roomCode, votedSocketId: p.socketId });
      });

      choicesContainer.appendChild(btn);
    });
  }
}

// Render: Screen RESULTS
function renderResults(room, me) {
  const header = document.getElementById('results-announcement');
  const voteBreakdown = document.getElementById('results-vote-breakdown');
  const scoresList = document.getElementById('results-scores-list');
  const hostControls = document.getElementById('results-host-controls');
  const nonhostWaiting = document.getElementById('results-nonhost-waiting');

  const res = room.roundResult;
  if (!res) return;

  // Header alert customization
  header.innerHTML = '';
  if (res.tie) {
    header.className = 'text-center py-6 px-4 rounded-2xl bg-amber-950/30 border border-amber-500/20 glass-panel-glow-purple';
    header.innerHTML = `
      <i class="fa-solid fa-scale-balanced text-amber-400 text-3xl mb-2"></i>
      <h2 class="text-xl font-extrabold text-white">Beraberlik! Kimse Suçlanamadı</h2>
      <p class="text-xs text-amber-200/80 mt-1">Gereken çoğunluk sağlanamadığı için kimse suçlanamadı. Imposter bu el puan kazandı!</p>
    `;
  } else {
    const isElimImposter = res.isImposter;
    if (isElimImposter) {
      header.className = 'text-center py-6 px-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 glass-panel-glow-emerald';
      header.innerHTML = `
        <i class="fa-solid fa-crosshairs text-emerald-400 text-3xl mb-2 animate-bounce"></i>
        <h2 class="text-xl font-extrabold text-white">${res.eliminatedPlayer} Suçlandı!</h2>
        <h3 class="text-xs uppercase font-extrabold text-emerald-400 tracking-widest mt-1">KİMLİK: IMPOSTER <i class="fa-solid fa-check"></i></h3>
        <p class="text-xs text-emerald-200/80 mt-1">Masumlar Imposter'ı buldu ve bu tur puan kazandı! Herkes oyunda kalmaya devam ediyor.</p>
      `;
    } else {
      header.className = 'text-center py-6 px-4 rounded-2xl bg-red-950/30 border border-red-500/20 glass-panel-glow-red';
      header.innerHTML = `
        <i class="fa-solid fa-face-frown text-red-400 text-3xl mb-2"></i>
        <h2 class="text-xl font-extrabold text-white">${res.eliminatedPlayer} Suçlandı!</h2>
        <h3 class="text-xs uppercase font-extrabold text-red-400 tracking-widest mt-1">KİMLİK: MASUM <i class="fa-solid fa-xmark"></i></h3>
        <p class="text-xs text-red-200/80 mt-1">Yanlış kişiyi suçladınız! Imposter kendini gizlemeyi başardı ve bu tur puan kazandı!</p>
      `;
    }
  }

  // Vote breakdown display
  voteBreakdown.innerHTML = '';
  // Map player list to easily look up names from socketIds
  const playerMap = {};
  room.players.forEach(p => {
    playerMap[p.socketId] = p.name;
  });

  room.players.forEach(p => {
    const votesReceived = res.voteCounts[p.socketId] || 0;
    
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-xs';
    
    const pName = document.createElement('span');
    pName.className = 'font-semibold text-slate-300';
    pName.textContent = p.name;

    const votesDiv = document.createElement('div');
    votesDiv.className = 'flex items-center gap-1.5';
    
    const voteBadge = document.createElement('span');
    voteBadge.className = `px-2 py-0.5 rounded-full font-bold ${votesReceived > 0 ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-400'}`;
    voteBadge.textContent = `${votesReceived} Oy`;
    votesDiv.appendChild(voteBadge);

    item.appendChild(pName);
    item.appendChild(votesDiv);
    voteBreakdown.appendChild(item);
  });

  // Score list updates
  scoresList.innerHTML = '';
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  
  sortedPlayers.forEach(p => {
    const roundGains = res.roundScores[p.socketId] || 0;
    const isMe = p.name === playerName;
    
    const item = document.createElement('div');
    item.className = `flex items-center justify-between p-3 rounded-xl border ${isMe ? 'bg-purple-950/20 border-purple-500/30' : 'bg-white/5 border-white/5'} text-xs`;
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'flex items-center gap-2';
    
    if (room.imposters.includes(p.socketId)) {
      const shadowIcon = document.createElement('i');
      shadowIcon.className = 'fa-solid fa-user-secret text-red-400 text-xs';
      nameDiv.appendChild(shadowIcon);
    } else {
      const safeIcon = document.createElement('i');
      safeIcon.className = 'fa-solid fa-shield text-emerald-400 text-xs';
      nameDiv.appendChild(safeIcon);
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold text-slate-100';
    nameSpan.textContent = p.name;
    nameDiv.appendChild(nameSpan);

    // Show Rates
    const ratesSpan = document.createElement('span');
    ratesSpan.className = 'text-[9px] text-slate-400 ml-2 font-semibold';
    const dRate = p.detectiveRounds > 0 ? Math.round((p.detectiveWins / p.detectiveRounds) * 100) : 0;
    const iRate = p.imposterRounds > 0 ? Math.round((p.imposterWins / p.imposterRounds) * 100) : 0;
    ratesSpan.textContent = `(🕵️‍♂️ %${dRate} | 🎭 %${iRate})`;
    nameDiv.appendChild(ratesSpan);

    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'flex items-center gap-2';

    if (roundGains > 0) {
      const gainSpan = document.createElement('span');
      gainSpan.className = 'text-[10px] font-bold text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded';
      gainSpan.textContent = `+${roundGains}`;
      scoreDiv.appendChild(gainSpan);
    }

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'font-bold text-white';
    scoreSpan.textContent = `${p.score} Puan`;
    scoreDiv.appendChild(scoreSpan);

    item.appendChild(nameDiv);
    item.appendChild(scoreDiv);
    scoresList.appendChild(item);
  });

  // Host Next Actions Controls
  if (isHost) {
    hostControls.classList.remove('hidden');
    nonhostWaiting.classList.add('hidden');
  } else {
    hostControls.classList.add('hidden');
    nonhostWaiting.classList.remove('hidden');
  }
}

// Render: Screen ENDED
function renderEnded(room, me) {
  const displayWinners = document.getElementById('display-game-winners');
  const leaderboard = document.getElementById('final-leaderboard');
  const hostControls = document.getElementById('btn-restart-lobby');
  const hostDiv = document.getElementById('ended-host-controls');
  const nonhostWaiting = document.getElementById('ended-nonhost-waiting');

  const bestDetName = document.getElementById('achievement-detective-name');
  const bestDetRate = document.getElementById('achievement-detective-rate');
  const bestImpName = document.getElementById('achievement-imposter-name');
  const bestImpRate = document.getElementById('achievement-imposter-rate');

  // Display Winners
  if (room.winners && room.winners.length > 0) {
    displayWinners.textContent = room.winners.join(', ');
  } else {
    displayWinners.textContent = '-';
  }

  // Populate Achievements
  if (room.achievements) {
    const det = room.achievements.bestDetective;
    const imp = room.achievements.bestImposter;

    if (det) {
      bestDetName.textContent = det.name;
      bestDetRate.textContent = `%${det.rate} Doğruluk Oranı`;
    } else {
      bestDetName.textContent = '-';
      bestDetRate.textContent = '%0 Doğruluk Oranı';
    }

    if (imp) {
      bestImpName.textContent = imp.name;
      bestImpRate.textContent = `%${imp.rate} Başarı Oranı`;
    } else {
      bestImpName.textContent = '-';
      bestImpRate.textContent = '%0 Başarı Oranı';
    }
  }

  // Render leaderboard list
  leaderboard.innerHTML = '';
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

  sortedPlayers.forEach((p, index) => {
    const isMe = p.name === playerName;
    const item = document.createElement('div');
    item.className = `flex items-center justify-between p-4 rounded-2xl border ${isMe ? 'bg-purple-950/20 border-purple-500/30' : 'bg-white/5 border-white/5'}`;
    
    const leftDiv = document.createElement('div');
    leftDiv.className = 'flex items-center gap-3.5';

    // Medal display
    const rankBadge = document.createElement('div');
    rankBadge.className = 'w-7 h-7 flex items-center justify-center rounded-full font-bold text-xs';
    if (index === 0) {
      rankBadge.className += ' bg-amber-400 text-amber-950';
      rankBadge.innerHTML = '<i class="fa-solid fa-trophy text-xs"></i>';
    } else if (index === 1) {
      rankBadge.className += ' bg-slate-300 text-slate-900';
      rankBadge.textContent = '2';
    } else if (index === 2) {
      rankBadge.className += ' bg-amber-600 text-amber-950';
      rankBadge.textContent = '3';
    } else {
      rankBadge.className += ' bg-white/5 border border-white/10 text-slate-400';
      rankBadge.textContent = index + 1;
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'text-sm font-semibold text-slate-100';
    nameSpan.textContent = p.name + (isMe ? ' (Siz)' : '');
    
    // Add performance rates to leaderboard
    const dRate = p.detectiveRounds > 0 ? Math.round((p.detectiveWins / p.detectiveRounds) * 100) : 0;
    const iRate = p.imposterRounds > 0 ? Math.round((p.imposterWins / p.imposterRounds) * 100) : 0;
    const rateText = document.createElement('span');
    rateText.className = 'text-[10px] text-slate-400 ml-2 font-medium';
    rateText.textContent = `(🕵️‍♂️ %${dRate} | 🎭 %${iRate})`;

    leftDiv.appendChild(rankBadge);
    leftDiv.appendChild(nameSpan);
    leftDiv.appendChild(rateText);

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'text-sm font-extrabold text-white';
    scoreSpan.textContent = `${p.score} Puan`;

    item.appendChild(leftDiv);
    item.appendChild(scoreSpan);
    leaderboard.appendChild(item);
  });

  // Action Buttons
  if (isHost) {
    hostDiv.classList.remove('hidden');
    nonhostWaiting.classList.add('hidden');
  } else {
    hostDiv.classList.add('hidden');
    nonhostWaiting.classList.remove('hidden');
  }
}
