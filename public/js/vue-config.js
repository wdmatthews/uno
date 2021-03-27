const vue = new Vue({
  el: '#app',
  vuetify: new Vuetify({
    theme: { dark: true },
  }),
  data: () => ({
    id: '',
    room: '',
    gameStarted: false,
    isReady: false,
    roomCode: '',
    roomCodeRules: [
      v => !!v || 'Room code is required',
      v => (v && v.length <= 10) || 'Room code must be 10 characters or less',
      v => !/[^a-z]/.test(v) || 'Room code can only contain lowercase letters',
    ],
    roomCodeValid: false,
    showJoinRoomError: false,
    joinRoomError: '',
    showCards: false,
    drawCardDialog: false,
    selectedCard: null,
    cards: [],
    pileCard: {
      number: '0',
      color: 'blue',
    },
    participants: [],
    currentTurn: '',
    turnDirection: 1,
    winner: '',
    showWinnerDialog: false,
  }),
  methods: {
    joinRoom() {
      socket.emit('request-join', this.roomCode);
    },
    leaveRoom() {
      socket.emit('request-leave');
    },
    ready() {
      socket.emit('ready');
    },
    playCard() {
      if (this.selectedCard == null || !this.isMyTurn) return;
      socket.emit('play-card', this.selectedCard);
      this.selectedCard = null;
    },
    drawCard() {
      this.drawCardDialog = false;
      if (!this.isMyTurn) return;
      socket.emit('draw-card');
    },
    cardIsValid(card) {
      return card.color === 'grey'
        || this.pileCard.color === 'grey'
        || card.color === this.pileCard.color && card.color != null
        || card.number === this.pileCard.number && card.number != null
        || card.icon === this.pileCard.icon && card.icon != null;
    },
  },
  computed: {
    isMyTurn() {
      return this.id === this.currentTurn;
    },
    anyCardsValid() {
      for (let i = this.cards.length - 1; i >= 0; i--) {
        if (this.cardIsValid(this.cards[i])) return true;
      }
      
      return false;
    },
  },
});