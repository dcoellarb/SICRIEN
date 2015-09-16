/*
 * Module: for Entity management,
 * Metadata-drive module that provides CRUD services,
 * integrates with memcached,
 *
 * Created by dcoellar on 7/8/15.
 * Last modified by dcoellar on 8/13/15.
 * */

/*
 * Import Modules
*/
var bodyParser = require('body-parser');
var parseJSON = bodyParser.json({ extended:false });
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();
var fs = require('fs');

var metadata = require('./metadata/metadata');
var cache = require('./../cache/cache')
var memcached = require('./../memcached/memcached')
var dbdriver = require('./../dbdriver/dbdriver');

/*
 * Sets the routes used by this module
 * for all CRUD operations (including get All records)
 * and the upload service to upload binaries
 * */
var initRouting = function(app){
    /*
     * upload files
     * */
    app.post('/upload',app.oauth.validate,multipartMiddleware,function(req,res){

        keys = Object.keys(req.files)
        var path = req.files[keys[0]].path;

        if (fs.existsSync(path)) {

            var newpath = __dirname.replace("/modules/entity","") + '/public/tempFiles/' + req.files[keys[0]].originalFilename;
            fs.rename(path, newpath, function(err){

                if (err) {

                    console.log("Error moving uploaded file:" + err);
                    return res.status(500).json('Could not upload file');

                }

                var responseData = {file:newpath}
                return res.status(200).json(JSON.stringify(responseData));

            });

        }else{

            return res.status(500).json('Could not upload file');

        }
    });

    /*
     * get all entities service
     * */
    app.get('/:entity',app.oauth.validate,function(req,res) {

        var getFilterCollection = function (structure, att, s) {
            var parent = "";
            if (att != "") {
                parent = att + ".";
            }

            var array = new Array();
            if (structure && structure.length > 0) {
                for (i = 0; i < structure.length; i++) {
                    if (structure[i].attribute != "_id") {
                        var fieldItem = {};
                        if (structure[i].structure) {
                            var items = getFilterCollection(structure[i].structure, parent + structure[i].attribute, s);
                            array = array.concat(items);
                        } else {
                            if (structure[i].type == "String") {
                                fieldItem[parent + structure[i].attribute] = new RegExp(s, "i");
                            } else {
                                fieldItem[parent + structure[i].attribute] = {$gt: s};
                            }
                            array.push(fieldItem);
                        }
                    }
                }
            }
            return array;
        }

        //parse request data
        var entity = req.params.entity;
        var metadataDoc = metadata.getMetadata(entity);

        var cacheType = "None"
        if (metadataDoc.caching && metadataDoc.caching.getAll && metadataDoc.caching.getAll.cacheType) {
            cacheType = metadataDoc.caching.getAll.cacheType;
        }

        var query = {"options": {"skip": 0, "limit": 0, "sort": []}, "filters": {}};
        if (cacheType = "Paging"){
            if (req.query.skip) query.options.skip = parseInt(req.query.skip);
            if (req.query.count) query.options.limit = parseInt(req.query.count);
        }
        if (req.query.predicate && req.query.reverse) query.options.sort = [[req.query.predicate,(req.query.reverse=="true") ? 'asc' : 'desc']];
        //TODO - Add last modified date filter here
        if (req.query.search) query.filters = { $or: getFilterCollection(metadataDoc.structure,"",req.query.search) }; else query.filters = {};

        var dataSources = new Array();

        console.log("cache type:" + cacheType);
        if (cacheType != "Last-Modified-Date" && metadataDoc.caching && metadataDoc.caching.getAll && metadataDoc.caching.getAll.memcached == true) {
            var memcachedkey = entity;
            if (cacheType == "Paging"){
                memcachedkey = entity + "_" + query.options.skip;
            }

            console.log("memcachedkey:" + memcachedkey);
            var memcachedFunction = function (callback) {
                memcached(memcachedkey, callback);
            };
            dataSources.push(memcachedFunction);
        }

        var dbdriverFunction = function(callback){
            dbdriver.getAll(metadataDoc,entity,query,callback);
        };
        dataSources.push(dbdriverFunction);

        cache(req,res,dataSources,cacheType,function(err,data){
            if (err) {
                return res.status(500).json('Error reading ' + entity + '.');
            }
            return res.status(data.status).json(JSON.stringify(data.source));
        });
        /*
        //get data from db
        dbdriver.getAll(metadataDoc,entity,query,function(err,docs){
            if (err) {
                return res.status(500).json('Error reading ' + entity + '.');
            }

            return res.status(200).json(JSON.stringify(docs));

        });
        */
    });

    /*
     * get one propietario service
     * */
    app.get('/:entity/:id',app.oauth.validate,function(req,res){

        var entity = req.params.entity;
        var id = req.params.id;

        metadataDoc = metadata.getMetadata(entity);

        var dataSources = new Array();

        var cacheType = "None"
        if (metadataDoc.caching && metadataDoc.caching.get && metadataDoc.caching.get.cacheType){
            cacheType = metadataDoc.caching.get.cacheType;
        }

        if (cacheType != "Last-Modified-Date" && metadataDoc.caching && metadataDoc.caching.get && metadataDoc.caching.get.memcached == true) {
            var memcachedkey = entity + "_" + id
            var memcachedFunction = function (callback) {
                memcached(memcachedkey, callback);
            };
            dataSources.push(memcachedFunction);
        }

        var dbdriverFunction = function(callback){
            dbdriver.get(metadataDoc, entity, id,callback);
        };
        dataSources.push(dbdriverFunction);

        cache(req,res,dataSources,cacheType,function(err,data){
            if (err) {
                return res.status(500).json('Error reading ' + entity + '.');
            }
            return res.status(data.status).json(JSON.stringify(data.source));
        });
        /*
        memcached.get(memcachedkey, function (err, data) {
            if (err) {
                dbdriver.get(metadataDoc, entity, id, function (err, doc) {
                    if (err) {
                        return res.status(500).json('Error reading ' + entity + '.');
                    }
                    return res.status(200).json(JSON.stringify(doc));
                });
            } else {
                return res.status(200).json(JSON.stringify(data));
            }
        });
        */
    });

    /*
     * post one entity service
     * */
    app.post('/:entity',app.oauth.validate,parseJSON,function(req,res){

        var entity = req.params.entity;
        var doc = req.body;
        delete doc["_id"];

        dbdriver.insert(entity,doc,function(err,result){
            if (err) {

                console.log("Error inseting " + entity + ":" + err.message);
                return res.status(500).json('Error inserting ' + entity + '.');

            }

            return res.status(201).json(result);

        });
    });

    /*
     * delete one entity service
     * */
    app.delete('/:entity/:id',app.oauth.validate,function(req,res){

        var entity = req.params.entity;
        var id = req.params.id;

        dbdriver.delete(entity,id,function(err){

            if (err){

                console.log("Error deleting " + entity + ":" + err.message);
                return res.status(500).json('Error deleting ' + entity + '.');

            }

            return res.sendStatus(200);


        });

    });

    /*
     * update one entity service
     * */
    app.put('/:entity/:id',app.oauth.validate,parseJSON,function(req,res){

        var entity = req.params.entity;
        var id = req.params.id;
        var doc = req.body;
        delete doc["_id"];

        dbdriver.update(entity,id,doc,function(err){

            if (err){

                console.log("Error connecto to mongodb:" + err.message);
                return res.status(500).json('Error connecting to DB.');

            }

            return res.sendStatus(200);

        });

    });
};


/*
 * The export function of this module
 * initializes Metadata, Middlewares and Routes
 * */
module.exports = function(app) {
    metadata.initRoutes(app);
    metadata.initMetadata(__dirname + '/metadata/docs/');

    //TODO - set dbdriver config from app config
    initRouting(app);
}