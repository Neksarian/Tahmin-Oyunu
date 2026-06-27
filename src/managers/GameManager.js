import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load questions safely
const questionsPath = path.join(__dirname, '../data/questions.json');
let questions = [];
try {
  questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
} catch (error) {
  console.error("Questions could not be loaded:", error);
}

class GameManager {
  constructor() {
    this.rooms = new Map();
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(socketId, hostName) {
    const roomCode = this.generateRoomCode();
    const room = {
      roomCode,
      hostId: socketId,
      status: 'lobby', // 'lobby', 'question', 'discussion', 'voting', 'results', 'ended'
      players: [
        {
          socketId,
          name: hostName,
          score: 0,
          isAlive: true,
          answered: false,
          answer: null,
          voted: false,
          vote: null,
          connected: true,
          imposterRounds: 0,
          imposterWins: 0,
          detectiveRounds: 0,
          detectiveWins: 0
        }
      ],
      config: {
        rounds: 7, // default to 7 rounds as requested
        imposterCount: 1
      },
      currentRound: 0,
      currentQuestion: null,
      imposters: [],
      questionsPool: [],
      eliminatedList: [], // keeps track of accused players each round
      timer: 0,
      disconnectTimeouts: new Map() // socketId -> Timeout reference
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(roomCode.toUpperCase());
  }

  joinRoom(roomCode, socketId, name) {
    const room = this.getRoom(roomCode);
    if (!room) {
      throw new Error('Oda bulunamadı.');
    }

    if (room.status !== 'lobby') {
      throw new Error('Oyun zaten başladı, lobiye katılamazsınız.');
    }

    // Check if name is taken
    const existingPlayer = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existingPlayer) {
      if (!existingPlayer.connected) {
        existingPlayer.socketId = socketId;
        existingPlayer.connected = true;
        
        const timeout = room.disconnectTimeouts.get(name);
        if (timeout) {
          clearTimeout(timeout);
          room.disconnectTimeouts.delete(name);
        }
        return room;
      } else {
        throw new Error('Bu isim zaten alınmış.');
      }
    }

    room.players.push({
      socketId,
      name,
      score: 0,
      isAlive: true,
      answered: false,
      answer: null,
      voted: false,
      vote: null,
      connected: true,
      imposterRounds: 0,
      imposterWins: 0,
      detectiveRounds: 0,
      detectiveWins: 0
    });

    return room;
  }

  handleDisconnect(socketId) {
    let affectedRoom = null;
    let playerName = '';

    for (const [code, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.socketId === socketId);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        player.connected = false;
        playerName = player.name;
        affectedRoom = room;
        break;
      }
    }

    if (!affectedRoom) return null;

    if (affectedRoom.status === 'lobby') {
      affectedRoom.players = affectedRoom.players.filter(p => p.socketId !== socketId);
      if (affectedRoom.hostId === socketId) {
        if (affectedRoom.players.length > 0) {
          affectedRoom.hostId = affectedRoom.players[0].socketId;
        } else {
          this.rooms.delete(affectedRoom.roomCode);
          return { roomDeleted: true, roomCode: affectedRoom.roomCode };
        }
      }
      return { roomDeleted: false, room: affectedRoom, roomCode: affectedRoom.roomCode };
    }

    const roomCode = affectedRoom.roomCode;
    const timeout = setTimeout(() => {
      const currentRoom = this.rooms.get(roomCode);
      if (currentRoom) {
        const pIndex = currentRoom.players.findIndex(p => p.name === playerName);
        if (pIndex !== -1 && !currentRoom.players[pIndex].connected) {
          // Instead of permanently eliminating them, we just mark connected=false.
          // They are kept in game but won't block state transition.
          const connectedPlayers = currentRoom.players.filter(p => p.connected);
          if (connectedPlayers.length === 0) {
            this.rooms.delete(roomCode);
            console.log(`Room ${roomCode} deleted due to inactivity.`);
            return;
          }

          if (currentRoom.hostId === currentRoom.players[pIndex].socketId) {
            currentRoom.hostId = connectedPlayers[0].socketId;
          }
        }
      }
    }, 30000);

    affectedRoom.disconnectTimeouts.set(playerName, timeout);

    if (affectedRoom.hostId === socketId) {
      const connectedPlayers = affectedRoom.players.filter(p => p.connected);
      if (connectedPlayers.length > 0) {
        affectedRoom.hostId = connectedPlayers[0].socketId;
      }
    }

    return { roomDeleted: false, room: affectedRoom, roomCode };
  }

  reconnectPlayer(roomCode, name, socketId) {
    const room = this.getRoom(roomCode);
    if (!room) {
      throw new Error('Oda bulunamadı.');
    }

    const player = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (!player) {
      throw new Error('Bu odada bu isimde bir oyuncu bulunamadı.');
    }

    if (player.connected) {
      throw new Error('Oyuncu zaten bağlı.');
    }

    player.socketId = socketId;
    player.connected = true;

    const timeout = room.disconnectTimeouts.get(player.name);
    if (timeout) {
      clearTimeout(timeout);
      room.disconnectTimeouts.delete(player.name);
    }

    const connectedPlayers = room.players.filter(p => p.connected);
    if (connectedPlayers.length === 1) {
      room.hostId = socketId;
    }

    return room;
  }

  startGame(roomCode, rounds = 7, imposterCount = 1, customQuestions = [], useOnlyCustom = false) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Oda bulunamadı.');

    if (room.players.length < 3) {
      throw new Error('Oyuna başlamak için en az 3 oyuncu gereklidir.');
    }

    room.config.rounds = parseInt(rounds) || 7;
    room.config.imposterCount = parseInt(imposterCount) || 1;
    
    if (room.config.imposterCount >= room.players.length) {
      room.config.imposterCount = Math.max(1, Math.floor(room.players.length / 2));
    }

    // Reset scores & statistics
    room.players.forEach(p => {
      p.score = 0;
      p.isAlive = true;
      p.connected = true;
      p.imposterRounds = 0;
      p.imposterWins = 0;
      p.detectiveRounds = 0;
      p.detectiveWins = 0;
    });

    room.currentRound = 0;
    room.eliminatedList = [];

    // Setup questions pool
    let pool = [];
    if (useOnlyCustom && customQuestions && customQuestions.length > 0) {
      pool = [...customQuestions];
    } else {
      pool = [...questions];
      if (customQuestions && customQuestions.length > 0) {
        pool = [...pool, ...customQuestions];
      }
    }

    room.questionsPool = pool.sort(() => 0.5 - Math.random());

    // Ensure the pool has enough questions for the game
    if (room.questionsPool.length < room.config.rounds) {
      if (useOnlyCustom && customQuestions.length > 0) {
        while (room.questionsPool.length < room.config.rounds) {
          room.questionsPool = [...room.questionsPool, ...customQuestions.sort(() => 0.5 - Math.random())];
        }
      } else {
        const extraNeeded = room.config.rounds - room.questionsPool.length;
        const defaults = [...questions].sort(() => 0.5 - Math.random());
        room.questionsPool = [...room.questionsPool, ...defaults.slice(0, extraNeeded)];
      }
    }

    this.startRound(room);
    return room;
  }

  startRound(room) {
    room.currentRound += 1;
    room.status = 'question';

    // Reset round-specific choices (Everyone is alive)
    room.players.forEach(p => {
      p.isAlive = true; // No elimination, everyone is alive
      p.answered = false;
      p.answer = null;
      p.voted = false;
      p.vote = null;
    });

    // Select question
    if (room.questionsPool.length === 0) {
      room.questionsPool = [...questions].sort(() => 0.5 - Math.random());
    }
    room.currentQuestion = room.questionsPool.pop();

    // RANDOMLY SELECT IMPOSTERS FOR EACH QUESTION
    // We select imposters from connected players (everyone is alive)
    const connectedPlayers = room.players.filter(p => p.connected);
    const count = Math.min(room.config.imposterCount, connectedPlayers.length - 1);
    
    const shuffled = [...connectedPlayers].sort(() => 0.5 - Math.random());
    room.imposters = shuffled.slice(0, count).map(p => p.socketId);

    // Track roles statistics
    room.players.forEach(p => {
      if (room.imposters.includes(p.socketId)) {
        p.imposterRounds++;
      } else {
        p.detectiveRounds++;
      }
    });
  }

  submitAnswer(roomCode, socketId, answer) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Oda bulunamadı.');
    if (room.status !== 'question') throw new Error('Cevap aşamasında değilsiniz.');

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) throw new Error('Oyuncu bulunamadı.');

    player.answer = parseFloat(answer);
    player.answered = true;

    // Check if all connected players answered
    const activePlayers = room.players.filter(p => p.connected);
    const allAnswered = activePlayers.every(p => p.answered);

    if (allAnswered) {
      room.status = 'discussion';
    }

    return { room, allAnswered };
  }

  submitVote(roomCode, votingSocketId, votedSocketId) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Oda bulunamadı.');
    if (room.status !== 'voting') throw new Error('Oylama aşamasında değilsiniz.');

    const votingPlayer = room.players.find(p => p.socketId === votingSocketId);
    if (!votingPlayer) throw new Error('Oyuncu bulunamadı.');

    const votedPlayer = room.players.find(p => p.socketId === votedSocketId);
    if (!votedPlayer) throw new Error('Oylanan oyuncu bulunamadı.');

    votingPlayer.vote = votedSocketId;
    votingPlayer.voted = true;

    // Check if all connected players voted
    const activePlayers = room.players.filter(p => p.connected);
    const allVoted = activePlayers.every(p => p.voted);

    if (allVoted) {
      this.calculateResults(room);
    }

    return { room, allVoted };
  }

  calculateResults(room) {
    room.status = 'results';

    // Count votes
    const voteCounts = {};
    room.players.forEach(p => {
      voteCounts[p.socketId] = 0;
    });

    room.players.forEach(p => {
      if (p.vote) {
        voteCounts[p.vote] = (voteCounts[p.vote] || 0) + 1;
      }
    });

    // Find who has the max votes
    let maxVotes = -1;
    let candidatesToAccuse = [];

    for (const [sId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        candidatesToAccuse = [sId];
      } else if (count === maxVotes) {
        candidatesToAccuse.push(sId);
      }
    }

    let accusedPlayer = null;
    let isImposter = false;
    let tie = false;

    if (candidatesToAccuse.length === 1) {
      const accusedId = candidatesToAccuse[0];
      accusedPlayer = room.players.find(p => p.socketId === accusedId);
      if (accusedPlayer) {
        // Record accusation, but NO ELIMINATION! Keep them alive.
        room.eliminatedList.push(accusedPlayer.name);
        isImposter = room.imposters.includes(accusedId);
      }
    } else {
      tie = true;
    }

    // Scoring and stats updates
    const roundScores = {};
    room.players.forEach(p => {
      roundScores[p.socketId] = 0;
    });

    // If Imposter survived (not the single most voted player, or tie)
    if (tie || !accusedPlayer || !isImposter) {
      // Imposters win
      room.players.forEach(p => {
        if (room.imposters.includes(p.socketId)) {
          p.score += 15;
          p.imposterWins++;
          roundScores[p.socketId] = 15;
        }
      });
    } else {
      // Masums win (Innocents successfully accused the Imposter)
      room.players.forEach(p => {
        if (!room.imposters.includes(p.socketId)) {
          p.score += 10;
          roundScores[p.socketId] = 10;
        }
      });
    }

    // Calculate individual Detective accuracy: did P vote for the actual Imposter?
    room.players.forEach(p => {
      if (!room.imposters.includes(p.socketId)) {
        // P is a Detective (Masum). Did P vote for one of the actual imposters?
        if (p.vote && room.imposters.includes(p.vote)) {
          p.detectiveWins++;
        }
      }
    });

    room.roundResult = {
      eliminatedPlayer: accusedPlayer ? accusedPlayer.name : null, // accusedPlayer name for compatibility
      eliminatedSocketId: accusedPlayer ? accusedPlayer.socketId : null,
      isImposter,
      tie,
      voteCounts,
      roundScores
    };
  }

  nextRoundOrEnd(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Oda bulunamadı.');

    if (room.currentRound >= room.config.rounds) {
      room.status = 'ended';
      this.calculateFinalStandings(room);
    } else {
      this.startRound(room);
    }

    return room;
  }

  calculateFinalStandings(room) {
    // 1. Overall winner by score
    let maxScore = -1;
    room.players.forEach(p => {
      if (p.score > maxScore) {
        maxScore = p.score;
      }
    });
    room.winners = room.players.filter(p => p.score === maxScore).map(p => p.name);

    // 2. Best Detective (Highest Detective success percentage)
    // Rate: (detectiveWins / detectiveRounds) * 100
    let bestDetective = null;
    let maxDetRate = -1;
    
    // 3. Best Imposter (Highest Imposter success percentage)
    // Rate: (imposterWins / imposterRounds) * 100
    let bestImposter = null;
    let maxImpRate = -1;

    room.players.forEach(p => {
      p.detectiveRate = p.detectiveRounds > 0 ? Math.round((p.detectiveWins / p.detectiveRounds) * 100) : 0;
      p.imposterRate = p.imposterRounds > 0 ? Math.round((p.imposterWins / p.imposterRounds) * 100) : 0;

      if (p.detectiveRounds > 0 && p.detectiveRate > maxDetRate) {
        maxDetRate = p.detectiveRate;
        bestDetective = { name: p.name, rate: p.detectiveRate };
      }
      if (p.imposterRounds > 0 && p.imposterRate > maxImpRate) {
        maxImpRate = p.imposterRate;
        bestImposter = { name: p.name, rate: p.imposterRate };
      }
    });

    room.achievements = {
      bestDetective,
      bestImposter
    };
  }

  resetToLobby(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Oda bulunamadı.');

    room.status = 'lobby';
    room.currentRound = 0;
    room.currentQuestion = null;
    room.imposters = [];
    room.eliminatedList = [];
    room.roundResult = null;
    room.winners = null;
    room.achievements = null;

    room.players.forEach(p => {
      p.score = 0;
      p.isAlive = true;
      p.answered = false;
      p.answer = null;
      p.voted = false;
      p.vote = null;
      p.imposterRounds = 0;
      p.imposterWins = 0;
      p.detectiveRounds = 0;
      p.detectiveWins = 0;
      p.detectiveRate = 0;
      p.imposterRate = 0;
    });

    return room;
  }
}

export default new GameManager();
