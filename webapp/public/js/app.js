/**
 * Created by dcoellar on 6/24/15.
 */

var app = angular.module('SICRIEN', ['angucomplete-alt','angularFileUpload','ngRoute','ui.bootstrap']);

/*
 *   initialize entity
 */
app.run(function($rootScope,$http){
    $rootScope.entity = {
        name:'',
        view:'',
        viewType:'',
        metadata:'',
        data:'',
        setMetadata : function(callback){
            var entityName = this.name;
            $http.get('http://localhost:3001/metadata/' + entityName).
                success(function(data, status, headers, config) {
                    $rootScope.entity.metadata = JSON.parse(data);
                    callback();
                }).
                error(function(data, status, headers, config) {
                    console.log("error geting json");
                });
        }
    };
});

/*
*   Routing
*/
app.config(function($routeProvider) {
    $routeProvider
        .when('/', {
            controller:'',
            templateUrl:'home.html'
        })
        .when('/list', {
            controller:'listController as list',
            templateUrl:'templates/list.html'
        })
        .when('/detail/:id', {
            controller  : 'detailController as detail',
            templateUrl : 'templates/detail.html'
        })
        .when('/form/:id', {
            controller  : 'recordController as record',
            templateUrl : 'templates/form.html'
        })
        .otherwise({
            redirectTo:'/'
        });
});

/*
 *   Controllers
 */
app.controller('MainController', function($scope,$rootScope, $location) {
    $scope.menuPropietarios = function(){
        $rootScope.entity.name = 'propietarios';
        $location.path( "/list" );
    };
    $scope.menuTiposPlaca = function(){
        //TODO - Add instaciated attribute for propietario id
        $rootScope.entity.name = 'tiposPlaca';
        $location.path( "/list" );
    };
});

/*
 *   Sevices
 */
app.factory('utils', function() {
    var utils = {
        getProp : function (obj, propDesc) {
            if (obj && propDesc){
                var arr = propDesc.split(".");
                if (arr.length > 0){
                    while(arr.length && (obj = obj[arr.shift()]));
                    return obj;
                }else{
                    return obj[propDesc]
                }
            }else{
                console.log("Error: trying to get value for object, object or property is null");
            }
        },
        setProp : function (obj, prop, value) {
            if (typeof prop === "string")
                prop = prop.split(".");

            if (prop.length > 1) {
                var e = prop.shift();
                this.setProp(obj[e] =
                        Object.prototype.toString.call(obj[e]) === "[object Object]"
                            ? obj[e]
                            : {},
                    prop,
                    value);
            } else{
                obj[prop[0]] = value
            }
        },
        findPropEntity : function(array,prop){
            for(var i=0;i<array.length;i++){
                if (array[i].attribute == prop) {
                    return array[i].entity;
                } else if(array[i].structure){
                    this.findPropEntity(array[i].structure,prop);
                }
            }
        }
    };
    return utils
});
