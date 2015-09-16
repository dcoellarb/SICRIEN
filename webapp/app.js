    /**
 * Created by dcoellar on 7/4/15.
 */
    var express = require('express');

    var app = express();
    app.use(express.static(__dirname + '/public'));
    module.exports = app;