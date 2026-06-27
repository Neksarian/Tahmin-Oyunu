import registerRoomHandlers from './roomHandlers.js';
import registerGameHandlers from './gameHandlers.js';

export default function setupSockets(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Register handlers
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('error', (err) => {
      console.error(`Socket error on ID ${socket.id}:`, err);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}
