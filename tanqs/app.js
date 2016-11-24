var express = require('express');
var path = require('path');
var app = express();
var http = require('http').Server(app);

var config = require('./server/config.json');

// Serve the public folder statically
app.use(express.static(path.join(__dirname, 'public')));

// Listen for traffic
var server_port = config.server.port;
http.listen(server_port, function(){
  console.log('listening on : ' + server_port);
});

// Create the game

var Game = require('./server/game.js');

var game = new Game(config.game, http);

game.begin_loop();