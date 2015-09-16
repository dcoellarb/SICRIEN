/**
 * List Controllers
 * Created by dcoellar on 6/23/15.
 */
app.controller('listController', function($rootScope, $http, $modal, $log, utils) {
    var list = this;

    var init = function(){
        var entity = $rootScope.entity;

        //Set List Title
        list.title = entity.metadata.selection.title;

        //Set Search
        list.search = "";
        list.searchChanged = function(){
            list.getData();
        };

        //Set List Actions
        //This is for custom metadata define actions

        //Set List Headers
        list.columns = entity.metadata.selection.columns;

        //Set List Sort
        if (entity.metadata.selection.defaultSorting){
            list.predicate = entity.metadata.selection.defaultSorting.attribute;
            list.reverse = entity.metadata.selection.defaultSorting.asc;
        }
        list.order = function(predicate) {
            list.reverse = (list.predicate === predicate) ? !list.reverse : true;
            list.predicate = predicate;
            list.getData();
        };


        //Pagination Functions
        list.pageSize = 5;//TODO - SICRIEN - move 10 to global page configuration or metadata configuration

        list.getPage = function(skip,count){
            $http.get('http://localhost:3001/' + entity.name + "?skip=" + skip + "&count=" + count + "&predicate=" + list.predicate + "&reverse=" + list.reverse + "&search=" + list.search).
                success(function(data, status, headers, config) {
                    var result = JSON.parse(data);
                    list.total = result.total;
                    console.log(list.total)
                    list.items = result.data;
                }).
                error(function(data, status, headers, config) {
                    console.log("error geting json");
                });
        };
        list.pageChange = function(){
            list.getPage(((list.currentPage - 1)*list.pageSize),list.pageSize);
        };


        //Get Data
        list.getData = function(){
            list.currentPage = 1;
            list.getPage(0,list.pageSize);
        }

        //Get initial data
        list.getData();

        //Standard Actions
        list.callView = function(id){

        };
        list.delete = function(id){
            var selectedId = id;
            var modalInstance = $modal.open({
                animation: true,
                templateUrl: 'confirm.html',
                controller: 'modalInstance as modal',
                size: 'lg'
            });

            modalInstance.result.then(function () {
                $http.delete('http://localhost:3001/' + entity.name + '/' + id).
                    success(function(data, status, headers, config) {
                        for(var i = 0; i < list.items.length; i++) {
                            var obj = list.items[i];
                            if(obj._id == id) {
                                list.items.splice(i, 1);
                            }
                        }
                    }).
                    error(function(data, status, headers, config) {
                        console.log("error updating json");
                    });
            }, function () {
                $log.info('Modal dismissed at: ' + new Date());
            });
        };

        //Utilities
        list.utils = utils;
    }

    $rootScope.entity.setMetadata(init);
});

app.controller('modalInstance', function ($modalInstance) {
    var modal = this;

    modal.ok = function () {
        $modalInstance.close();
    };

    modal.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

/**
 * Form Controllers
 * Created by dcoellar on 6/24/15.
 */
app.controller('recordController', function($window, $rootScope, $scope, $http, $location, $routeParams, utils, FileUploader) {
    var id = $routeParams.id;
    var entity = $rootScope.entity;

    var record = this;

    //Set initialize Form function
    record.initializeForm = function(){
        record.classes = {input:"form-control",btn:"btn",btn_default:"btn-default"};
        record.structure = entity.metadata.structure;
        record.fields = entity.metadata.form.fields;

        //Completer fields metadata definition
        for (i = 0; i < record.fields.length; i++) {
            field = record.fields[i];
            if (!field.class) field.class = "form-control";
            if (!field.class) field.containerClass = "col-md-12";
        }

        //Add standard actions
        var saveButton = {
            "type": "save",
            "caption": "Save",
            "class": ["btn","btn-default"],
            "containerClass" : "col-md-1"
        };
        record.fields.push(saveButton);

        var cancelButton = {
            "type": "cancel",
            "caption": "Cancel",
            "class": ["btn","btn-default"],
            "containerClass" : "col-md-1"
        };
        record.fields.push(cancelButton);
    }

    //utilities
    record.utils = utils;

    //Get Data
    if (id){
        $http.get('http://localhost:3001/' + entity.name + '/' + id).
            success(function(data, status, headers, config) {
                record.item = JSON.parse(data);

                //Initialize record fields
                record.initializeForm();

                //Initialize fields data
                for (i = 0; i < record.fields.length; i++) {
                    field = record.fields[i];
                    if (field.attribute){
                        if (field.type == "textAutocomplete") {
                            var entity = record.utils.findPropEntity(record.structure, field.attribute);
                            var value = record.utils.getProp(record.item, entity.toLowerCase() + "." + field.title);
                            var key = record.utils.getProp(record.item, field.attribute);
                            field.selectedObject = {};
                            field.selectedObject[field.title] = value;
                            field.selectedObject["_id"] = key;
                        } else if (field.type == "image"){
                            field.uploader = new FileUploader({
                                url: 'http://localhost:3001/upload',//TODO - make url dynamic
                                alias : field.attribute,
                                queueLimit: 2
                            });

                            // FILTERS
                            field.uploader.filters.push({
                                name: 'imageFilter',
                                fn: function(item /*{File|FileLikeObject}*/, options) {
                                    var type = '|' + item.type.slice(item.type.lastIndexOf('/') + 1) + '|';
                                    return '|jpg|png|jpeg|bmp|gif|'.indexOf(type) !== -1;
                                }
                            });

                            // CALLBACKS
                            field.uploader.onWhenAddingFileFailed = function(item /*{File|FileLikeObject}*/, filter, options) {
                                console.info('onWhenAddingFileFailed', item,filter,options);
                            };
                            field.uploader.onAfterAddingFile = function(fileItem) {
                                console.info('onAfterAddingFile', fileItem);
                                if (fileItem.uploader.queue.length > 1){
                                    fileItem.uploader.removeFromQueue(0);
                                }
                            };
                            field.uploader.onAfterAddingAll = function(addedFileItems) {
                                console.info('onAfterAddingAll', addedFileItems);
                            };
                            field.uploader.onBeforeUploadItem = function(item) {
                                console.info('onBeforeUploadItem', item);
                            };
                            field.uploader.onProgressItem = function(fileItem, progress) {
                                console.info('onProgressItem', fileItem, progress);
                            };
                            field.uploader.onProgressAll = function(progress) {
                                console.info('onProgressAll', progress);
                            };
                            field.uploader.onSuccessItem = function(fileItem, response, status, headers) {
                                //console.info('onSuccessItem', fileItem, response, status, headers);
                                if (status == 200){

                                }
                            };
                            field.uploader.onErrorItem = function(fileItem, response, status, headers) {
                                console.info('onErrorItem', fileItem, response, status, headers);
                            };
                            field.uploader.onCancelItem = function(fileItem, response, status, headers) {
                                console.info('onCancelItem', fileItem, response, status, headers);
                            };
                            field.uploader.onCompleteItem = function(fileItem, response, status, headers) {
                                console.info('onCompleteItem', fileItem, response, status, headers);
                                if (status == 200){

                                }
                            };
                            field.uploader.onCompleteAll = function() {
                                console.info('onCompleteAll');
                            };

                        } else {
                            field.model = record.utils.getProp(record.item, field.attribute);
                        }
                        if (!field.class) field.class = "form-control";
                        if (!field.class) field.containerClass = "col-md-12";
                    }
                }
            }).
            error(function(data, status, headers, config) {
                console.log("error geting json");
            });
    }else{
        record.item = {};

        //Initialize record fields
        record.initializeForm();
    }

    //Manage Actions
    record.save = function(){
        if (id){
            //update item
            record.item = {};
            for (i = 0; i < record.fields.length; i++) {
                field = record.fields[i];
                if (field.attribute){
                    if (field.type == "textAutocomplete"){
                        if (field.selectedObject.originalObject){
                            record.utils.setProp(record.item,field.attribute,field.selectedObject.originalObject._id);
                        }else{
                            record.utils.setProp(record.item,field.attribute,field.selectedObject.key);
                        }
                    } else {
                        record.utils.setProp(record.item,field.attribute,field.model);
                    }
                }
            }

            //call put service
            $http.put('http://localhost:3001/' + entity.name + '/' + id,JSON.stringify(record.item)).
                success(function(data, status, headers, config) {
                    $window.history.back();
                }).
                error(function(data, status, headers, config) {
                    console.log("error updating json");
                });
        }else{
            //update item
            for (i = 0; i < record.fields.length; i++) {
                field = record.fields[i];
                if (field.attribute && field.attribute != "_id"){
                    if (field.type == "textAutocomplete"){
                        record.utils.setProp(record.item,field.attribute,field.selectedObject.key);
                    } else {
                        record.utils.setProp(record.item,field.attribute,field.model);
                    }
                }
            }
            //call put service
            $http.post('http://localhost:3001/' + entity.name,JSON.stringify(record.item)).
                success(function(data, status, headers, config) {
                    $window.history.back();
                }).
                error(function(data, status, headers, config) {
                    console.log("error updating json");
                });
        }
    };

    record.cancel = function(){
        $window.history.back()
    };

});

/**
 * Views Controllers
 * Created by dcoellar on 6/24/15.
 */
app.controller('detailController', function($location, $routeParams) {
    var detail = this;
    var id = $routeParams.id;
    detail.item = {id:2,text:'build an angular app'};
    detail.tabs = [
        {role:'general',title:'General',active:true,disabled:false,template:"resources/templates/tabular.html"},
        {role:'invoices',title:'Invoices',active:false,disabled:false,template:"resources/templates/tabList.html"},
        {role:'proposals',title:'Proposals',active:false,disabled:false,template:"resources/templates/tabList.html"}
    ];
});