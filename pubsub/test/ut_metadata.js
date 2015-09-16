/**
 * Created by dcoellar on 8/11/15.
 */
var expect    = require("chai").expect;
var request = require("request");
var fs = require('fs');
var metadata = require("../modules/entity/metadata/metadata");
metadata.config.path = __dirname + '/../modules/entity/metadata/docs/test/';

describe("Get Metadata", function() {
    describe("Get existing Metadata", function() {
        it("Get metadata doc", function() {
            var doc = metadata.getMetadata("testCustomers")
            expect(doc).to.not.be.undefined;
            expect(doc).to.not.be.null;
            expect(doc.name).to.equal("TestCustomers");

        });
    });

    describe("Get non-existing Metadata", function() {
        it("Get error when getting metadata", function() {

            var doc = metadata.getMetadata("testNonExistant")
            expect(doc).to.be.null;

        });
    });
});

describe("Init Routes", function() {

    describe("Get existing Metadata from service", function() {
        var url = "http://localhost:3001/metadata/testCustomers";

        it("Returns status 200", function() {

            request(url, function(error, response, body) {
                expect(response.statusCode).to.equal(200);
            });

        });

        it("Get metadata doc from service", function() {

            request(url, function(error, response, body) {

                var doc = JSON.stringify(body)
                expect(doc).to.not.be.undefined;
                expect(doc).to.not.be.null;
                expect(doc.name).to.equal("TestCustomers");

            });

        });
    });

    describe("Get non existing Metadata from service", function() {
        var url = "http://localhost:3001/metadata/testCustomersNonExisting";

        it("Returns status 404", function() {

            request(url, function(error, response, body) {
                expect(response.statusCode).to.equal(404);
            });

        });

   });

});

describe("Init Metadata", function() {

    var path = __dirname + '/../modules/entity/metadata/docs/test/testCustomers.json';
    var doc;

    before(function() {
        doc = JSON.parse(fs.readFileSync(path, 'utf8'));
    });

    it("Adds form", function() {

        metadata.initMetadata(__dirname + '/../modules/entity/metadata/docs/test/');
        var metadataDoc = JSON.parse(fs.readFileSync(path, 'utf8'));
        expect(metadataDoc.form).to.not.be.undefined;

    });

    after(function() {
        fs.writeFileSync(path,JSON.stringify(doc));
    });

});