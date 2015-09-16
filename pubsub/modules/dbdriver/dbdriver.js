/**
 * Created by dcoellar on 8/7/15.
 */
var mongodb = require('./drivers/mongodb');

var dbdriver = {
    config : {
        dbms : "mongodb",
        conn : 'mongodb://localhost:27017/sicrien'
    },
    count : function(metadata,entity,query,callback){

        if (this.config.dbms == "mongodb"){
            mongodb.count(this.config,metadata,entity,query,callback);
        }

    },
    getAll : function(metadata,entity,query,callback){

        if (this.config.dbms == "mongodb"){
            mongodb.getAll(this.config,metadata,entity,query,callback);
        }

    },
    get : function(metadata,entity,id,callback){

        if (this.config.dbms == "mongodb"){
            mongodb.get(this.config,metadata,entity,id,callback);
        }

    },
    insert : function(entity,doc,callback){

        if (this.config.dbms == "mongodb"){
            mongodb.insert(this.config,entity,doc,callback);
        }

    },
    update : function(entity,id,doc,callback){

        if (this.config.dbms == "mongodb"){
            mongodb.update(this.config,entity,id,doc,callback);
        }

    },
    delete : function(entity,id,callback){

        if (this.config.dbms == "mongodb"){
            mongodb.delete(this.config,entity,id,callback);
        }

    }

};

module.exports = dbdriver;