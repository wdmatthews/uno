const { sanitizeRoomCode, tryJoinRoom, tryLeaveRoom, tryReady, startGame, tryPlayCard, tryDrawCard } = require('./db-api');

module.exports = function(io, MongoClient, mongoURL) {
  io.on('connection', (socket) => {
    socket.on('request-join', async (roomCode) => {
      // Sanitize the room code.
      const sanitizedCode = sanitizeRoomCode(roomCode);
      if (!sanitizedCode) return;
      let room = '';
      let err = '';
      // If the socket has not joined the room, join it.
      if (!socket.rooms.has(sanitizedCode)) {
        const { joinSucceeded, error } = await tryJoinRoom(socket.id, sanitizedCode, MongoClient, mongoURL);
        if (joinSucceeded) {
          room = sanitizedCode;
          socket.roomCode = room;
          socket.join(`room-${room}`);
        }
        else err = error;
      }
      
      socket.emit('request-join-result', room, err);
    });
    
    socket.on('request-leave', async () => {
      const sanitizedCode = sanitizeRoomCode(socket.roomCode);
      if (!sanitizedCode) return;
      // Make the socket leave the room if it is in the room.
      if (socket.rooms.has(`room-${sanitizedCode}`)) {
        const { participants, currentTurn } = await tryLeaveRoom(socket.id, sanitizedCode, MongoClient, mongoURL);
        socket.roomCode = '';
        socket.leave(`room-${sanitizedCode}`);
        // If there are participants left, notify them that someone left.
        if (participants.length > 0) {
          io.to(`room-${sanitizedCode}`).emit('participant-left', participants, currentTurn);
        }
      }
      socket.emit('request-leave-result');
    });
    
    socket.on('ready', async () => {
      const sanitizedCode = sanitizeRoomCode(socket.roomCode);
      if (!sanitizedCode) return;
      if (socket.rooms.has(`room-${sanitizedCode}`)) {
        // Mark the participant as ready.
        const gameStarted = await tryReady(socket.id, sanitizedCode, MongoClient, mongoURL);
        socket.emit('ready-result');
        if (gameStarted) {
          // Start the game by dealing cards and deciding who's turn it is.
          const { pileCard, participants, currentTurn, turnDirection } = await startGame(sanitizedCode, MongoClient, mongoURL);
          // Send the starting data to every participant.
          io.in(`room-${sanitizedCode}`).emit('game-started', participants, pileCard, currentTurn, turnDirection);
        }
      }
    });
    
    socket.on('play-card', async (cardIndex) => {
      const sanitizedCode = sanitizeRoomCode(socket.roomCode);
      if (!sanitizedCode || typeof cardIndex != 'number') return;
      if (socket.rooms.has(`room-${sanitizedCode}`)) {
        // Attempt to play the card.
        const { cardPlayed, participantIndex, participantCards, card, currentTurn, turnDirection, drawParticipant } = await tryPlayCard(socket.id, sanitizedCode, cardIndex, MongoClient, mongoURL);
        // If the card was played, notify everyone.
        if (cardPlayed) {
          io.in(`room-${sanitizedCode}`).emit('card-played', participantIndex, participantCards, card, currentTurn, turnDirection, drawParticipant);
        }
      }
    });
    
    socket.on('draw-card', async () => {
      const sanitizedCode = sanitizeRoomCode(socket.roomCode);
      if (!sanitizedCode) return;
      if (socket.rooms.has(`room-${sanitizedCode}`)) {
        // Attempt to draw a card.
        const { cardDrawn, participantIndex, participantCards, currentTurn } = await tryDrawCard(socket.id, sanitizedCode, MongoClient, mongoURL);
        // If the card was drawn, notify everyone.
        if (cardDrawn) {
          io.in(`room-${sanitizedCode}`).emit('card-drawn', participantIndex, participantCards, currentTurn);
        }
      }
    });
    
    socket.on('disconnect', async () => {
      if (socket.roomCode) {
        const sanitizedCode = sanitizeRoomCode(socket.roomCode);
        // Leave the room and notify any remaining participants.
        const { participants, currentTurn } = await tryLeaveRoom(socket.id, sanitizedCode, MongoClient, mongoURL);
        if (participants.length > 0) {
          io.to(`room-${sanitizedCode}`).emit('participant-left', participants, currentTurn);
        }
      }
    });
  });
}