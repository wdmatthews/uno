const cards = require('./cards');

// https://stackoverflow.com/a/6274381
function shuffle(a) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}

module.exports = {
  sanitizeRoomCode(roomCode) {
    // Make sure the room code is a string, and only contains lowercase letters.
    if (typeof roomCode != 'string' || /[^a-z]/.test(roomCode) || roomCode.length === 0) return false;
    // Make sure the room code length is between 1 and 10.
    return roomCode.substring(0, Math.min(roomCode.length, 10));
  },
  
  async tryJoinRoom(participantID, roomCode, MongoClient, mongoURL) {
    let client = null;
    let joinSucceeded = false;
    let error = false;
    
    try {
      client = await MongoClient.connect(mongoURL, { useUnifiedTopology: true });
      const rooms = client.db('uno').collection('rooms');
      const room = await rooms.findOne({ code: roomCode });
      // Create the room if it does not exist.
      if (!room) {
        await rooms.insertOne({
          code: roomCode,
          participants: [
            {
              id: participantID,
              name: 'User 1',
              isReady: false,
              cards: [],
            },
          ],
          nextParticipantName: 2,
          gameStarted: false,
          cards: shuffle(cards),
          pileCard: {},
          currentTurn: '',
          turnDirection: 1,
        });
        joinSucceeded = true;
      }
      // Add the participant to the room, if there is room.
      else if (!room.gameStarted && room.participants.length < 4) {
        // Add the participant.
        room.participants.push({
          id: participantID,
          name: `User ${room.nextParticipantName++}`,
          isReady: false,
          cards: [],
        });
        
        // Update the room in the database.
        await rooms.updateOne({ code: roomCode }, {
          $set: {
            participants: room.participants,
            nextParticipantName: room.nextParticipantName,
          },
        });
        
        joinSucceeded = true;
      }
      
      // Report error if there is one.
      if (room && room.gameStarted) error = 'Game already started';
      else if (room && room.participants.length >= 4) error = 'Room full (max of 4)';
    } finally {
      await client.close();
    }
    
    return { joinSucceeded, error };
  },
  
  async tryLeaveRoom(participantID, roomCode, MongoClient, mongoURL) {
    let client = null;
    let participants = null;
    let currentTurn = '';
    
    try {
      client = await MongoClient.connect(mongoURL, { useUnifiedTopology: true });
      const rooms = client.db('uno').collection('rooms');
      const room = await rooms.findOne({ code: roomCode });
      // Remove the participant from the room.
      if (room) {
        for (let i = room.participants.length - 1; i >= 0; i--) {
          const participant = room.participants[i];
          if (participant.id === participantID) {
            // Add the participant's cards to the room's cards.
            room.cards = room.cards.concat(participant.cards);
            // Remove the participant.
            room.participants.splice(i, 1);
            participants = room.participants;
            const participantCount = participants.length;
            
            // If the current turn was the participant that left and there are other participants,
            // go to the next turn.
            if (participant.id === room.currentTurn && room.participants.length > 0) {
              let nextTurn = i + room.turnDirection;
              if (nextTurn >= participantCount) nextTurn = 0;
              else if (nextTurn < 0) nextTurn = participantCount - 1;
              room.currentTurn = room.participants[nextTurn].id;
            }
            
            currentTurn = room.currentTurn;
            
            await rooms.updateOne({ code: roomCode }, {
              $set: {
                participants: room.participants,
                cards: room.cards,
              },
            });
            break;
          }
        }
      }
      
      // If there are no participants, destroy the room.
      if (room && room.participants.length === 0) {
        await rooms.deleteOne({ code: roomCode });
      }
    } finally {
      await client.close();
    }
    
    return { participants, currentTurn };
  },
  
  async tryReady(participantID, roomCode, MongoClient, mongoURL) {
    let client = null;
    let gameStarted = false;
    
    try {
      client = await MongoClient.connect(mongoURL, { useUnifiedTopology: true });
      const rooms = client.db('uno').collection('rooms');
      const room = await rooms.findOne({ code: roomCode });
      // Mark the participant as ready and check if everyone else is ready.
      if (room) {
        let someoneNotReady = false;
        let participantFound = false;
        // Find the participant, mark them ready,
        // and find if someone is not ready.
        for (let i = room.participants.length - 1; i >= 0; i--) {
          if (room.participants[i].id === participantID) {
            room.participants[i].isReady = true;
            participantFound = true;
          } else if (!room.participants[i].isReady) someoneNotReady = true;
        }
        
        if (participantFound) {
          // The game will start when everyone is ready and there are multiple participants.
          gameStarted = !someoneNotReady && room.participants.length > 1;
          await rooms.updateOne({ code: roomCode }, {
            $set: {
              participants: room.participants,
              gameStarted,
            },
          });
        }
      }
    } finally {
      await client.close();
    }
    
    return gameStarted;
  },
  
  async startGame(roomCode, MongoClient, mongoURL) {
    let client = null;
    let pileCard = null;
    let participants = null;
    let currentTurn = '';
    let turnDirection = 1;
    
    try {
      client = await MongoClient.connect(mongoURL, { useUnifiedTopology: true });
      const rooms = client.db('uno').collection('rooms');
      const room = await rooms.findOne({ code: roomCode });
      if (room) {
        let cardCount = 0;
        // Give 7 cards to each person and remove those from the room's cards.
        for (let i = room.participants.length - 1; i >= 0; i--) {
          const participant = room.participants[i];
          for (let j = 0; j < 7; j++) {
            cardCount = room.cards.length;
            participant.cards.push(room.cards[cardCount - 1]);
            room.cards.splice(cardCount - 1, 1);
          }
        }
        
        // Take the top card from the draw pile and place it face up.
        cardCount = room.cards.length;
        pileCard = room.cards[cardCount - 1];
        room.pileCard = pileCard;
        room.cards.splice(cardCount - 1, 1);
        
        // Pick a random participant to start.
        participants = room.participants;
        currentTurn = participants[Math.floor((Math.random() * participants.length))].id;
        room.currentTurn = currentTurn;
        room.turnDirection = turnDirection;
        
        await rooms.updateOne({ code: roomCode }, {
          $set: {
            participants: room.participants,
            cards: room.cards,
            pileCard: room.pileCard,
            currentTurn: room.currentTurn,
          },
        });
      }
    } finally {
      await client.close();
    }
    
    return { pileCard, participants, currentTurn, turnDirection };
  },
  
  async tryPlayCard(participantID, roomCode, cardIndex, MongoClient, mongoURL) {
    let client = null;
    let cardPlayed = false;
    let participantIndex = 0;
    let participantCards = null;
    let card = null;
    let currentTurn = '';
    let turnDirection = 1;
    let drawParticipant = null;
    
    try {
      client = await MongoClient.connect(mongoURL, { useUnifiedTopology: true });
      const rooms = client.db('uno').collection('rooms');
      const room = await rooms.findOne({ code: roomCode });
      if (room) {
        // Find the participant with the given ID.
        let participant = false;
        for (let i = room.participants.length - 1; i >= 0; i--) {
          if (room.participants[i].id === participantID) {
            participant = room.participants[i];
            participantIndex = i;
            break;
          }
        }
        
        if (participant) {
          // Make sure the card index is valid.
          if (cardIndex < 0 || cardIndex >= participant.cards.length) cardIndex = 0;
          // Add the current pile card to the bottom of the draw pile.
          room.cards.unshift(room.pileCard);
          // Set the pile card to the card that was just played.
          room.pileCard = participant.cards[cardIndex];
          // Remove the card from the participant.
          participant.cards.splice(cardIndex, 1);
          
          const participantCount = room.participants.length;
          const isDraw2Card = room.pileCard.number === '+2';
          const isDraw4Card = room.pileCard.number === '+4';
          const cardCount = room.cards.length;
          
          // Draw cards if needed.
          if (isDraw2Card || isDraw4Card) {
            const drawCount = isDraw4Card ? 4 : 2;
            // Find the participant that will draw cards.
            let drawParticipantIndex = participantIndex + room.turnDirection;
            if (drawParticipantIndex >= participantCount) drawParticipantIndex = 0;
            else if (drawParticipantIndex < 0) drawParticipantIndex = participantCount - 1;
            drawParticipant = room.participants[drawParticipantIndex];
            
            // Add the cards to the participant.
            for (let i = 1; i <= drawCount; ++i) {
              // If there are no more cards to draw, stop drawing.
              if (cardCount - i < 0) break;
              drawParticipant.cards.push(room.cards[cardCount - i]);
              room.cards.splice(cardCount - i, 1);
            }
          }
          
          // Reverse the turn order if there are more than two participants.
          const isReverseCard = room.pileCard.icon === 'swap-vertical';
          if (isReverseCard && participantCount > 2) {
            room.turnDirection *= -1;
          }
          
          const isSkipCard = room.pileCard.icon === 'close' || isDraw2Card || isDraw4Card;
          // Find the next turn, based on if the turn was skipped and the turn direction.
          let nextTurn = participantIndex + room.turnDirection * (isSkipCard ? 2 : 1);
          if (nextTurn === participantCount) nextTurn = 0;
          else if (nextTurn === participantCount + 1) nextTurn = 1;
          else if (nextTurn === -1) nextTurn = participantCount - 1;
          else if (nextTurn === -2) nextTurn = participantCount - 2;
          // If there are only two participants, do not go to the next turn.
          if ((isSkipCard || isReverseCard) && participantCount === 2) {
            nextTurn = participantIndex;
          }
          
          room.currentTurn = room.participants[nextTurn].id;
          cardPlayed = true;
          card = room.pileCard;
          currentTurn = room.currentTurn;
          turnDirection = room.turnDirection;
          participantCards = participant.cards;
          
          await rooms.updateOne({ code: roomCode }, {
            $set: {
              participants: room.participants,
              cards: room.cards,
              pileCard: room.pileCard,
              currentTurn: room.currentTurn,
              turnDirection: room.turnDirection,
            },
          });
        }
      }
    } finally {
      await client.close();
    }
    
    return { cardPlayed, participantIndex, participantCards, card, currentTurn, turnDirection, drawParticipant };
  },
  
  async tryDrawCard(participantID, roomCode, MongoClient, mongoURL) {
    let client = null;
    let cardDrawn = false;
    let participantIndex = 0;
    let participantCards = null;
    let currentTurn = '';
    
    try {
      client = await MongoClient.connect(mongoURL, { useUnifiedTopology: true });
      const rooms = client.db('uno').collection('rooms');
      const room = await rooms.findOne({ code: roomCode });
      if (room) {
        let participant = false;
        for (let i = room.participants.length - 1; i >= 0; i--) {
          if (room.participants[i].id === participantID) {
            participant = room.participants[i];
            participantIndex = i;
            break;
          }
        }
        
        if (participant) {
          // Draw a card and give it to the participant.
          let cardCount = room.cards.length;
          let drawnCard = room.cards[cardCount - 1];
          participant.cards.push(drawnCard);
          room.cards.splice(cardCount - 1, 1);
          cardCount = room.cards.length;
          
          // Go to the next turn if the drawn card cannot be played.
          const participantCount = room.participants.length;
          let nextTurn = participantIndex + room.turnDirection;
          if (nextTurn >= participantCount) nextTurn = 0;
          else if (nextTurn < 0) nextTurn = participantCount - 1;
          if (drawnCard.color === 'grey'
            || drawnCard.color === room.pileCard.color
            || drawnCard.number === room.pileCard.number && drawnCard.number != null
            || drawnCard.icon === room.pileCard.icon && drawnCard.icon != null) {
            nextTurn = participantIndex;
          }
          
          room.currentTurn = room.participants[nextTurn].id;
          cardDrawn = true;
          currentTurn = room.currentTurn;
          participantCards = participant.cards;
          
          await rooms.updateOne({ code: roomCode }, {
            $set: {
              participants: room.participants,
              cards: room.cards,
              currentTurn: room.currentTurn,
            },
          });
        }
      }
    } finally {
      await client.close();
    }
    
    return { cardDrawn, participantIndex, participantCards, currentTurn };
  }
};