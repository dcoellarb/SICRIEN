/**
 * Created by dcoellar on 9/6/15.
 */

var memjs = require('memjs');
//TODO - move this app config
var mc = memjs.Client.create('127.0.0.1:11211');

var memcached = function(memcachedkey,callback){
    console.log("getting memcached key:" + memcachedkey)
    mc.get(memcachedkey, function (err, data, key) {
        callback(err,data);
    });
};

module.exports = memcached;
