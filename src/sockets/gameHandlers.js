import GameManager from '../managers/GameManager.js';

const activeIntervals = new Map();

function startRoomTimer(io, room, duration, onComplete) {
  // Clear existing timer if any
  if (activeIntervals.has(room.roomCode)) {
    clearInterval(activeIntervals.get(room.roomCode));
    activeIntervals.delete(room.roomCode);
  }

  room.timer = duration;
  io.to(room.roomCode).emit('timer:tick', { seconds: room.timer, status: room.status });

  const interval = setInterval(() => {
    room.timer--;
    io.to(room.roomCode).emit('timer:tick', { seconds: room.timer, status: room.status });

    if (room.timer <= 0) {
      clearInterval(interval);
      activeIntervals.delete(room.roomCode);
      onComplete();
    }
  }, 1000);

  activeIntervals.set(room.roomCode, interval);
}

function clearRoomTimer(roomCode) {
  if (activeIntervals.has(roomCode)) {
    clearInterval(activeIntervals.get(roomCode));
    activeIntervals.delete(roomCode);
  }
}

function transitionToVoting(io, room) {
  room.status = 'voting';
  // Reset voting states
  room.players.forEach(p => {
    p.voted = false;
    p.vote = null;
  });
  
  io.to(room.roomCode).emit('room:updated', room);

  // Start 30 seconds voting timer
  startRoomTimer(io, room, 30, () => {
    try {
      GameManager.calculateResults(room);
      io.to(room.roomCode).emit('room:updated', room);
    } catch (err) {
      console.error('Error during voting timeout resolution:', err);
    }
  });
}

export default function registerGameHandlers(io, socket) {
  // Start the game
  socket.on('game:start', ({ roomCode, rounds, imposterCount, customQuestions, useOnlyCustom }) => {
    try {
      const room = GameManager.getRoom(roomCode);
      if (!room) return socket.emit('error:msg', 'Oda bulunamadı.');
      if (room.hostId !== socket.id) {
        return socket.emit('error:msg', 'Yalnızca oda sahibi oyunu başlatabilir.');
      }

      GameManager.startGame(roomCode, rounds, imposterCount, customQuestions, useOnlyCustom);
      clearRoomTimer(roomCode);
      io.to(roomCode).emit('room:updated', room);
      console.log(`Game started in room ${roomCode} with ${rounds} rounds, ${imposterCount} imposter(s) and custom questions: ${customQuestions ? customQuestions.length : 0}.`);
    } catch (error) {
      socket.emit('error:msg', error.message);
    }
  });

  // Submit numerical answer
  socket.on('game:submit_answer', ({ roomCode, answer }) => {
    try {
      if (answer === undefined || answer === null || answer === '' || isNaN(Number(answer))) {
        return socket.emit('error:msg', 'Lütfen geçerli bir sayısal cevap girin.');
      }

      const { room, allAnswered } = GameManager.submitAnswer(roomCode, socket.id, answer);

      if (allAnswered) {
        clearRoomTimer(roomCode);
        io.to(roomCode).emit('room:updated', room);

        // Start discussion timer
        startRoomTimer(io, room, 60, () => {
          try {
            transitionToVoting(io, room);
          } catch (err) {
            console.error('Error during transition to voting:', err);
          }
        });
      } else {
        io.to(roomCode).emit('room:updated', room);
      }
    } catch (error) {
      socket.emit('error:msg', error.message);
    }
  });

  // Submit vote for imposter
  socket.on('game:submit_vote', ({ roomCode, votedSocketId }) => {
    try {
      if (!votedSocketId) {
        return socket.emit('error:msg', 'Lütfen oy vereceğiniz oyuncuyu seçin.');
      }

      const { room, allVoted } = GameManager.submitVote(roomCode, socket.id, votedSocketId);

      if (allVoted) {
        clearRoomTimer(roomCode);
        io.to(roomCode).emit('room:updated', room);
      } else {
        io.to(roomCode).emit('room:updated', room);
      }
    } catch (error) {
      socket.emit('error:msg', error.message);
    }
  });

  // Go to next round (Host only)
  socket.on('game:next_round', ({ roomCode }) => {
    try {
      const room = GameManager.getRoom(roomCode);
      if (!room) return socket.emit('error:msg', 'Oda bulunamadı.');
      if (room.hostId !== socket.id) {
        return socket.emit('error:msg', 'Sadece oda sahibi sonraki tura geçebilir.');
      }

      const updatedRoom = GameManager.nextRoundOrEnd(roomCode);
      clearRoomTimer(roomCode);
      io.to(roomCode).emit('room:updated', updatedRoom);
    } catch (error) {
      socket.emit('error:msg', error.message);
    }
  });

  // Return to Lobby (Host only)
  socket.on('game:reset_lobby', ({ roomCode }) => {
    try {
      const room = GameManager.getRoom(roomCode);
      if (!room) return socket.emit('error:msg', 'Oda bulunamadı.');
      if (room.hostId !== socket.id) {
        return socket.emit('error:msg', 'Sadece oda sahibi lobiye dönebilir.');
      }

      const updatedRoom = GameManager.resetToLobby(roomCode);
      clearRoomTimer(roomCode);
      io.to(roomCode).emit('room:updated', updatedRoom);
    } catch (error) {
      socket.emit('error:msg', error.message);
    }
  });
}
