import GameManager from '../managers/GameManager.js';

export default function registerRoomHandlers(io, socket) {
  // Host creates a room
  socket.on('room:create', ({ hostName }) => {
    try {
      if (!hostName || hostName.trim() === '') {
        return socket.emit('error:msg', 'Lütfen geçerli bir isim girin.');
      }
      const room = GameManager.createRoom(socket.id, hostName.trim());
      socket.join(room.roomCode);
      
      socket.emit('room:created', { roomCode: room.roomCode, room });
      io.to(room.roomCode).emit('room:updated', room);
      console.log(`Room created: ${room.roomCode} by ${hostName}`);
    } catch (error) {
      socket.emit('error:msg', error.message);
    }
  });

  // Player joins a room
  socket.on('room:join', ({ roomCode, name }) => {
    try {
      if (!roomCode || roomCode.trim() === '') {
        return socket.emit('error:msg', 'Lütfen oda kodunu girin.');
      }
      if (!name || name.trim() === '') {
        return socket.emit('error:msg', 'Lütfen isminizi girin.');
      }

      const formattedCode = roomCode.trim().toUpperCase();
      const formattedName = name.trim();

      const room = GameManager.joinRoom(formattedCode, socket.id, formattedName);
      socket.join(formattedCode);

      socket.emit('room:joined', { roomCode: formattedCode, room });
      io.to(formattedCode).emit('room:updated', room);
      console.log(`Player ${formattedName} joined room ${formattedCode}`);
    } catch (error) {
      socket.emit('error:msg', error.message);
    }
  });

  // Reconnection attempt
  socket.on('room:reconnect', ({ roomCode, name }) => {
    try {
      if (!roomCode || !name) {
        return socket.emit('error:msg', 'Eksik yeniden bağlanma bilgileri.');
      }

      const formattedCode = roomCode.trim().toUpperCase();
      const formattedName = name.trim();

      const room = GameManager.reconnectPlayer(formattedCode, formattedName, socket.id);
      socket.join(formattedCode);

      socket.emit('room:reconnected', { roomCode: formattedCode, room });
      io.to(formattedCode).emit('room:updated', room);
      console.log(`Player ${formattedName} reconnected to room ${formattedCode}`);
    } catch (error) {
      socket.emit('error:msg', `Yeniden bağlanılamadı: ${error.message}`);
    }
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    try {
      const result = GameManager.handleDisconnect(socket.id);
      if (result) {
        const { roomDeleted, room, roomCode } = result;
        if (roomDeleted) {
          console.log(`Room ${roomCode} deleted as host left and room is empty.`);
        } else if (room) {
          io.to(roomCode).emit('room:updated', room);
          console.log(`Player disconnected from room ${roomCode}. Reconnect timeout started.`);
        }
      }
    } catch (error) {
      console.error('Error on disconnect handler:', error);
    }
  });
}
