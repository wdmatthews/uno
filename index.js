const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { MongoClient } = require('mongodb');
const mongoURL = `mongodb://localhost:27017/uno`;

app.disable('x-powered-by');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

require('./socket-server')(io, MongoClient, mongoURL);

http.listen(3000, () => console.log(`App listening at http://localhost:3000`));