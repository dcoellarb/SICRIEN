/**
 * Created by dcoellar on 7/8/15.
 */
var fs = require('fs');

/*
 * Private function: Gets a collection of metadata files, used by initMetadata
 *
 * params: path : name of the entity
 * result : files collection : the list of files to be initialize
 * */
var getMetadataFiles = function(path){
    var files = new Array();
    var tempfiles = fs.readdirSync(path);
    for(var i=0;i<tempfiles.length;i++){
        if (fs.lstatSync(path + tempfiles[i]).isFile()){
            files.push(tempfiles[i]);
        }
    }
    return files;
};

/*
 * Private function: get form element type
 *
 * params: att : the att object
 * result : string : the data type
 * */
var getFormType = function(att){
    if (att.type == "String" || att.type == "ObjectId" || att.type == "Int" || att.type == "Date"){
        return "text";
    }else if(att.type = "Date"){
        return "text";//TODO - need to implement this
    }else if(att.type = "Boolean"){
        return "checkbox";
    }else if(att.type = "Blob"){
        return "text";//TODO - need to implement this
    }else if(att.type = "Image"){
        return "image";
    }
    return "";
};

/*
 * Private function: Creates a columns element
 *
 * params: att : the att object
 * result : json object : the form object
 * */
var getFormGrid = function(att,parent) {
    var columns = new Array();

    for(var i=0;i<att.structure.length;i++) {
        var level_att = att.structure[i];
        var column = {};
        if (!level_att.structure) {
            column["type"] = getFormType(level_att);
            column["title"] = level_att.attribute;
            column["attribute"] = parent + level_att.attribute;
            columns.push(column);
        }else{
            var temp_fields = getFormGrid(level_att,parent + att.attribute + ".")
            for (var i1 = 0; i1 < temp_fields.length; i1++) {
                columns.push(temp_fields[i1]);
            }
        }
    }

    return columns;
};

/*
 * Private function: Creates a form element
 *
 * params: entity : the entity object
 * result : json object : the form object
 * */
var getFormItem = function(entity,parent){
    var fields = new Array();
    for(var i=0;i<entity.structure.length;i++) {

        var att = entity.structure[i];
        var field = {};

        if (att.attribute){
            if (!att.structure){
                field["type"] = getFormType(att);
                field["label"] = att.name;
                field["attribute"] = parent + att.name;
                if (att.type = "ObjectId"){
                    field["readOnly"] = true;
                }
                fields.push(field);
            }else {
                var temp_fields = getFormItem(att,parent + att.attribute + ".")
                for (var i1 = 0; i1 < temp_fields.length; i1++) {
                    fields.push(temp_fields[i1]);
                }
            }
        }else if(att.level){
            field["type"] = "grid";
            field["label"] = parent + att.level;
            field["columns"] = getFormGrid(att,parent);
            fields.push(field);
        }
    }
    return fields;
};

/*
 * Private function: Creates a selection element
 *
 * params: entity : the entity object
 * result : json object : the selection object
 * */
var getSelectionItem = function(entity){

};

/*
 * Private function: Gets the default sort from entity structure
 *
 * params: entity : the entity object
 * result : string : name of the att
 * */
var getDefaultSort = function(entity){

};

/*
 * Private function: Intializes a metadata file, used by initMetadata
 *
 * params: file : file to be initialize
 * */
var initMetadataFile = function(file){
    var entity = JSON.parse(fs.readFileSync(file, 'utf8'));

    //By default it checks if the form propertiy exist if not it create the metadata
    if (entity.name){

        //Form
        if (!entity.form) {
            entity.form = {fields: getFormItem(entity, "")};
        }

        if (!entity.selection) {
            //Selection
            entity.selection = {
                title: "List of " + entity.name,
                columns: getSelectionItem(entity, "")
            };
            var defaultSortingAttribute = getDefaultSort(entity);
            if (defaultSortingAttribute){
                entity.selection.defaultSorting = {"attribute": defaultSortingAttribute, "asc": true};
            }
        }

        //save file
        fs.writeFileSync(file,JSON.stringify(entity));

        //init data //TODO -  need to finish this part
        if (entity.form){
            /*
             collection.find({}).count(function(err, count)  {
             if (err){
             console.log("Error counting " + entity.name + ":" + err.message);
             return;
             }
             if (count == 0){
             for(e = 0; e<entity.form.length; e++){//TODO figure out a way to initialize data taking into account FK
             //                                var dataEntity = entity.form[e];
             //                                var collection = conn.collection(entity.name);
             //                                    collection.insert(dataEntity, function(err, result) {
             //                                    console.log("Inserted record:" + result.ops[0]._id);
             //                                });
             }
             }
             });
             */
        }
    }
}


var metadata = {

    /*
     * Config prop for metadata object
     * */
    config : {
        path : __dirname + '/docs/'
    },

    /*
    * Gets a metadata object by the name
    *
    * params: entity : name of the entity
    * result : json object | null : returns the metadata as object or null if not found
    * */
    getMetadata : function(entity){
        var path = metadata.config.path + entity + '.json';
        if (fs.existsSync(path)) {
            return JSON.parse(fs.readFileSync(path, 'utf8'));
        }else{
            console.log("Error: could not find metadata file for:" + path);
            return null;
        }
    },

    /*
     * Initiailzes the required metadata routes
     *
     * params: app : receives the express js app
     * */
    initRoutes : function(app){
        app.get('/metadata/:entity',app.oauth.validate,function(req,res){
            var path = metadata.config.path + req.params.entity + '.json';
            if (!fs.existsSync(path)){
                res.status(404).json('Metadata for entity:' + req.params.entity + ' does not exist');
            }else{
                var doc = JSON.parse(fs.readFileSync(path, 'utf8'));
                res.status(200).json(JSON.stringify(doc));
            }
        });
    },

    /*
     * Initiailzes all json files inside the docs folder
     * param: path : path where to find the metadata docs
     * */
    initMetadata : function(path){
        files = getMetadataFiles(path);
        for(var i=0;i<files.length;i++){
            initMetadataFile(path + files[i])
        }
        return true;
    }
};

module.exports = metadata;
