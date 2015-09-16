/**
 * Created by dcoellar on 8/7/15.
 */

var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var async = require('async');

var dbconn;

var getSuperordinatedRecords = function(extendedColumns,record,keepalive,callback){

    //get an array of functions to run in parallel
    var functions = new Array();
    var count = 0
    for(i=0;i<extendedColumns.length;i++){

        functions.push(function(callback){

            var extColumn = extendedColumns[count];
            var id = record[extColumn.attribute];

            if (id){

                dbconn.collection(extColumn.entity).findOne({_id: ObjectId.createFromHexString(id)},function (err, doc) {

                    // get only the requested columns
                    var newDoc = {};
                    for(x=0;x<extColumn.columns.length;x++){
                        newDoc[extColumn.columns[x].attribute] = doc[extColumn.columns[x].attribute]
                    }

                    //Check if extended conlumn has extended columns
                    if (extColumn.extendedColumns && extColumn.extendedColumn.length > 0) {

                        //return doc merged with external fields
                        getSuperordinatedRecords(extColumn.extendedColumns,newDoc,callback)

                    } else{

                        //returns merged doc
                        var result = {};
                        result[extColumn.entity] = newDoc;
                        callback(null,result);

                    }
                });
            }else{

                //returns a empty entity
                var result = {};
                result[extColumn.entity] = null;
                callback(null,result);

            }
            count += 1
        });
    }

    async.parallel(
        functions,
        function(err,result){

            if (err){

                console.log("Error reading extended entities, message:" + err.message);
                callback(err,null);

            }else{

                //merge superordinated record
                for(x=0;x<result.length;x++){
                    for (var attrname in result[x]) { record[attrname] = result[x][attrname]; }
                }

                if (!keepalive){

                    disconnect();

                }

                //callback with merged results
                callback(null,record);
            }

        }
    );
}

var getSuperordinatedRecordsForCollection = function(extendedColumns,docs,callback){

    //get an array of functions to run in parallel
    var functions = new Array();
    var count = 0;
    for(i=0;i<docs.length;i++){

        functions.push(function(callback){
            var doc = docs[count];
            getSuperordinatedRecords(extendedColumns,doc,true,function(err,result){
                if (err){
                    console.log("Error reading " + entity + ":" + err.message);
                    callback(err,null);
                }else{
                    callback(null,result);
                }
            });
            count += 1;
        });

    }

    //execute array of functions in parallel
    async.parallel(
        functions,
        function(err,result){
            if (err){

                console.log("Error reading " + entity + ":" + err.message);

                //still send what i have
                callback(null,docs)

            }else{

                //Merge result to docs
                for(i=0;i<docs.length;i++) {
                    for (var attrname in result[i]) {
                        docs[i][attrname] = result[i][attrname];
                    }
                }

                disconnect();
                //callback merged docs
                callback(null,docs);
            }
        }
    );
}


var connect = function(config,callback){

    MongoClient.connect(config.conn, function(err, db) {

        dbconn = db;
        callback(err);

    });

};

var disconnect = function(){

    if (dbconn){

        dbconn.close();

    }
    dbconn = null;

};

var countRecords = function(entity,query,callback){

    dbconn.collection(entity).find(query.filters).count(function(err, count) {

        if (err){

            console.log("Error counting " + entity + ":" + err.message);
            callback(err,null);

        }else{

            callback(null,count);

        }

    });

}

var getAllRecords = function(metadata,entity,query,callback) {

    dbconn.collection(entity).find(query.filters,query.options).toArray(function(err, docs) {

        if (err){

            console.log("Error reading " + entity + ":" + err.message);
            callback(err,null);

        }else{

            //Check if there is extended data
            if (metadata.selection.extendedColumns && metadata.selection.extendedColumns.length > 0){

                //return docs merged with external fields
                getSuperordinatedRecordsForCollection(metadata.selection.extendedColumns,docs,callback);

            }
            else{

                disconnect();

                //return docs
                callback(null,docs)

            }
        }

    });

}

var getRecord = function(metadata,entity,id,callback) {

    dbconn.collection(entity).findOne({_id: ObjectId.createFromHexString(id)},function (err, doc) {

        if (err){

            console.log("Error reading " + entity + ":" + err.message);
            callback(err,null);

        }else{

            //Check if there is extended data
            if (metadata.selection.extendedColumns && metadata.selection.extendedColumns.length > 0){

                //return docs merged with external fields
                getSuperordinatedRecords(metadata.selection.extendedColumns,doc,false,callback);

            }
            else{

                disconnect();
                //return docs
                callback(null,doc)

            }
        }
    });

}

var insertRecord = function(entity,doc,callback){

    dbconn.collection(entity).insert(doc, function(err, result) {

        if (err){

            callback(err,null);

        }else{

            callback(err,JSON.stringify(result.ops[0]));

        }

    });

}

var deleteRecord = function(entity,doc,callback) {

    dbconn.collection(entity).remove({_id: ObjectId.createFromHexString(id)}, function (err, result) {

        if (err) {

            callback(err);

        } else {

            callback(null);

        }

    });

}

var updateRecord = function(entity,id,doc,callback) {

    dbconn.collection(entity).update({_id:ObjectId.createFromHexString(id)},doc, function(err, result) {

        if (err) {

            callback(err);

        } else {

            callback(null);

        }

    });

}

var mongodb = {

    count : function(config,metadata,entity,query,callback){
        connect(config,function(err){

            if (err){

                callback(err,null)

            } else {

                countRecords(entity,query,function(err,count){

                    disconnect();
                    if (err){

                        callback(err,null)

                    }
                    else {

                        callback(null,count);

                    }

                });

            }
        })
    },

    getAll : function(config,metadata,entity,query,callback){

        connect(config,function(err){

            if (err){

                callback(err,null);

            } else {

                async.parallel(
                    [
                        function(callback){

                            countRecords(entity,query,callback);

                        },
                        function(callback){

                            getAllRecords(metadata,entity,query,callback)

                        }
                    ],
                    function(err,result){

                        disconnect();

                        if (err){

                            callback(err,null);

                        } else {

                            callback(null,{total:result[0],data:result[1]});

                        }

                    }
                );

            }

        })
    },

    get : function(config,metadata,entity,id,callback){
        connect(config,function(err){

            if (err){

                callback(err,null);

            } else {

                getRecord(metadata,entity,id,callback)

            }

        })
    },

    insert : function(config,entity,doc,callback){

        connect(config,function(err){

            if (err){

                callback(err,null);

            } else {

                insertRecord(entity,doc,callback)

            }

        });

    },

    delete : function(config,entity,id,callback){

        connect(config,function(err){

            if (err){

                callback(err,null);

            } else {

                deleteRecord(entity,id,callback)

            }

        });

    },

    update : function(config,entity,id,doc,callback){

        connect(config,function(err){

            if (err){

                callback(err,null);

            } else {

                updateRecord(entity,id,doc,callback)

            }

        })

    }

}

module.exports = mongodb;

