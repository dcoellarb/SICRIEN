/*
 * Module: Main Application module,
 *
 * Created by dcoellar on 7/4/15.
 * Last modified by dcoellar on 8/18/15.
 * */

 /*
 * Import Modules
 */
 var express = require('express')

 /*
 * Import Internal Modules
 */
 var entity = require('./modules/entity/entity');
 var oauth = require('./modules/oauth/oauth');


 var app = express();
 app.disable('etag');//Disable ETag to manage caching through cache module

 //TODO - move all this to an extern .config file
 app.config = {
     secure : false
 }

 /*
  * Globar middleware, sets html headers for Access-Control-Allow to all requests
  * */
 app.use(function(req, res, next) {
     res.setHeader("Access-Control-Allow-Origin", "*");
     res.setHeader("Access-Control-Allow-Methods","GET, POST, PUT, DELETE, OPTIONS");
     res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
     return next();
 });

 /*
  * Globar middlewate sets express static middleare, is general to all requests
  * */
 app.use(express.static(__dirname + '/public'));

/*
 * Gets and initialize OAuth module
 */
oauth(app);

/*
 * Gets and initialize entity module
 */
entity(app);

var fun = function(param){
  console.log(param);
};

var hello = "Hello World"
var f = function(){
    fun(hello);
};

f();

module.exports = app;