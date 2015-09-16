/**
 * Created by dcoellar on 9/6/15.
 * https://www.npmjs.com/package/node-oauth2-server#getaccesstoken-bearertoken-callback
 */

/*
 * Import Modules
 */
var bodyParser = require('body-parser');
var oauthserver = require('oauth2-server');
var parseJSON = bodyParser.json({ extended:false });
var parseURL = bodyParser.urlencoded({ extended: true });

var model = {
    getAccessToken : function(bearerToken, callback){
        console.log("getAccessToken");
        //TODO - Send the right expires date and user
        callback(null,{expires:null,user:'johndoe'});
    },
    getClient : function(clientId, clientSecret, callback){
        console.log("getClient");
        //TODO - Validate client id and client secret
        //TODO - add redirectUri if authorization_code grant type
        callback(null,{clientId : clientId})
    },
    grantTypeAllowed : function(clientId, grantType, callback){
        console.log("grantTypeAllowed");
        if (grantType == "password"){
            callback(null,true)
        }else{
            callback("Grant type is invalid",false)
        }
        //TOOD - Add other grant types as they are implemented
    },
    getUser : function(username, password, callback){
        console.log("getUser");
        //TODO - Validate user and password
        callback(null,{id:username});
    },
    saveAccessToken : function(accessToken, clientId, expires, user, callback){
        console.log("saveAccessToken:" + accessToken);
        //TODO - save access token somewhere
        callback(null)
    },
    //Required for authorization_code grant type
    getAuthCode : function(authCode, callback){
        console.log("getAuthCode");
        callback("Error: get authcode not implemented")
    },
    saveAuthCode : function(authCode, clientId, expires, user, callback){
        console.log("saveAuthCode");
        callback("Error: save authcode not implemented")
    },
    //Required for refresh_token grant type
    saveRefreshToken : function(refreshToken, clientId, expires, user, callback){
        console.log("saveRefreshToken:" + refreshToken);
        //TODO - save access token somewhere
        callback(null)
    },
    getRefreshToken : function(refreshToken, callback){
        console.log("getRefreshToken");
        callback("Error: get refresh token not implemented")
    },
    //Optional for Refresh Token grant type
    revokeRefreshToken : function(refreshToken, callback){
        console.log("revokeRefreshToken");
        callback("Error: remoke refresh token not implemented")
    },
    //Required for extension grant grant type
    extendedGrant : function(grantType, req, callback){
        console.log("extendedGrant")
        callback("Error: extend grant not implemented")
    },
    //Required for client_credentials grant type
    getUserFromClient : function(clientId, clientSecret, callback){
        console.log("getUserFromClient");
        callback("Error: get user for client not implemented")
    },
    //Optional
    generateToken : function(type, req, callback){
        console.log("generateToken");
        callback(null,null)
    }
};

/*
 * The export function of this module
 * initializes oauth server
 * */
module.exports = function(app) {
    console.log("setup model")
    app.oauth = {
        oauth : oauthserver({
            model: model,
            grants: ['password'],
            debug: true
        }),
        validate : function(req,res,next) {
            if (app.config.secure){
                var auth = app.oauth.oauth.authorise();
                return auth(req, res, next);
            }else{
                next();
            }
        }
    };

    app.all('/oauth/token',parseURL,parseJSON,app.oauth.oauth.grant());

    app.get('/testOAuth',app.oauth.validate, function (req, res) {
        res.send('Secret area');
    });

    app.use(app.oauth.oauth.errorHandler());
}