/**
 * Created by dcoellar on 9/6/15.
 */
var etag = require('etag');
var functions;
var index = 0
var cache = function(req,res,dataSource,type,callback) {
    dataSource[index](function (err, data) {
        if (err) {
            callback(err, data);
        }else if(!data || data.length == 0 || !Object.keys(data).length){
            if (dataSource.length > index + 1){
                index += 1
                cache(req,res,dataSource,type,callback);
            }else{
                callback(err,data)
            }
        } else {
            if (type == "ETag") {

                var result = {status : 200,source : data}

                var localETag = etag(JSON.stringify(data));
                var remoteETag = req.getHeader('ETag');
                if (localETag == remoteETag){
                    var result = {status : 304,source : {}}
                }
                callback(null,result);

            }else if (type == "Last-Modified-Date"){

                //NOTE : Last-Modified-Date filter is setup in the query already.
                var result = {status : 200,source : data}
                if (data.length == 0 ){
                    result = {status : 304,source : []}
                }
                callback(null,result);

            }else if (type == "Paging"){

                var result = {status : 200,source : data}
                callback(null,result);

            }else {

                var result = {status : 200,source : data}
                callback(null,result);

            }
        }
    });
};

module.exports = cache;