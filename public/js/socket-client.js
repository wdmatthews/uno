const socket = io();

socket.on('request-join-result', (room, error) => {
  // Join the room or show an error.
  if (room) vue.room = room;
  else {
    vue.showJoinRoomError = true;
    vue.joinRoomError = error;
  }
});

socket.on('request-leave-result', () => {
  // Reset the game data.
  vue.room = '';
  vue.gameStarted = false;
  vue.isReady = false;
  vue.showCards = false;
  vue.drawCardDialog = false;
  vue.selectedCard = null;
  vue.winner = '';
  vue.showWinnerDialog = false;
});

socket.on('ready-result', () => vue.isReady = true);

socket.on('game-started', (participants, pileCard, currentTurn, turnDirection) => {
  vue.id = socket.id;
  
  for (let i = participants.length - 1; i >= 0; i--) {
    let participant = participants[i];
    // Set the card count of each participant.
    participant.cardCount = participant.cards.length;
    // Find this socket's participant and name it 'You'.
    if (participant.id === socket.id) {
      participant.name = 'You';
      vue.cards = participant.cards;
    }
    // Remove the cards from each participant other than this socket.
    else delete participant.cards;
  }
  
  // Set the game data.
  vue.gameStarted = true;
  vue.participants = participants;
  vue.pileCard = pileCard;
  vue.currentTurn = currentTurn;
  vue.turnDirection = turnDirection;
});

socket.on('card-played', (participantIndex, participantCards, card, currentTurn, turnDirection, drawParticipant) => {
  // Decrease the participant's card count.
  vue.participants[participantIndex].cardCount--;
  
  // Set the cards if the participant is this socket.
  if (vue.participants[participantIndex].id === socket.id) {
    vue.cards = participantCards;
  }
  
  // Update game data
  vue.pileCard = card;
  vue.currentTurn = currentTurn;
  vue.turnDirection = turnDirection;
  
  // If cards were drawn, update that participant's card count.
  if (drawParticipant) {
    for (let i = vue.participants.length - 1; i >= 0; i--) {
      let participant = vue.participants[i];
      if (participant.id === drawParticipant.id) {
        participant.cardCount = drawParticipant.cards.length;
        break;
      }
    }
    
    // Update this socket's card count if cards were drawn for it.
    if (drawParticipant.id === socket.id) {
      vue.cards = drawParticipant.cards;
    }
  }
  
  // If there are no remaining participants, show the win dialog.
  if (participantCards.length === 0) {
    vue.winner = vue.participants[participantIndex].name;
    vue.showWinnerDialog = true;
  }
});

socket.on('card-drawn', (participantIndex, participantCards, currentTurn) => {
  // Add to that participant's card count.
  vue.participants[participantIndex].cardCount++;
  
  // Set the cards if the participant is this socket.
  if (vue.participants[participantIndex].id === socket.id) {
    vue.cards = participantCards;
  }
  
  // Update the current turn.
  vue.currentTurn = currentTurn;
});

socket.on('participant-left', (participants, currentTurn) => {
  // Update the list of participants.
  for (let i = participants.length - 1; i >= 0; i--) {
    let participant = participants[i];
    participant.cardCount = participant.cards.length;
    if (participant.id === socket.id) participant.name = 'You';
    else delete participant.cards;
  }
  
  vue.participants = participants;
  vue.currentTurn = currentTurn;
  
  // If there are no other participants, show the win dialog.
  if (participants.length === 1) {
    vue.winner = 'You';
    vue.showWinnerDialog = true;
  }
});