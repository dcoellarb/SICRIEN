'use strict';

/*
 * Autocomplete directive for AngularJS
 * This is a fork of Hidenari Nozaki's angucomplete-alt with some extra features.
 * By Daniel Coellar
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // CommonJS
    module.exports = factory(require('angular'));
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define(['angular'], factory);
  } else {
    // Global Variables
    factory(root.angular);
  }
}(window, function (angular) {
  angular.module('angucomplete-alt', [] )
    .directive('angucompleteAlt', ['$q', '$parse', '$http', '$sce', '$timeout', '$templateCache', '$interpolate', function ($q, $parse, $http, $sce, $timeout, $templateCache, $interpolate) {
    // keyboard events
    var KEY_DW  = 40;
    var KEY_RT  = 39;
    var KEY_UP  = 38;
    var KEY_LF  = 37;
    var KEY_ES  = 27;
    var KEY_EN  = 13;
    var KEY_BS  =  8;
    var KEY_DEL = 46;
    var KEY_TAB =  9;

    var MIN_LENGTH = 3;
    var MAX_LENGTH = 524288;  // the default max length per the html maxlength attribute
    var PAUSE = 500;
    var BLUR_TIMEOUT = 200;

    // string constants
    var REQUIRED_CLASS = 'autocomplete-required';
    var TEXT_SEARCHING = 'Searching...';
    var TEXT_NORESULTS = 'No results found';
    var TEMPLATE_URL = '/angucomplete-alt/index.html';

    // Set the default template for this directive
    $templateCache.put(TEMPLATE_URL,
        '<div class="angucomplete-holder" ng-class="{\'angucomplete-dropdown-visible\': showDropdown}">' +
        '  <input id="{{id}}_value" name="{{inputName}}" ng-class="{\'angucomplete-input-not-empty\': notEmpty}" ng-model="searchStr" ng-disabled="disableInput" type="{{inputType}}" placeholder="{{placeholder}}" maxlength="{{maxlength}}" ng-focus="onFocusHandler()" class="{{inputClass}}" ng-focus="resetHideResults()" ng-blur="hideResults($event)" autocapitalize="off" autocorrect="off" autocomplete="off" ng-change="inputChangeHandler(searchStr)"/>' +
        '  <input id="{{id}}_key" ng-model="searchKey" type="hidden"/>' +
        '  <div id="{{id}}_dropdown" class="angucomplete-dropdown" ng-show="showDropdown">' +
        '    <div class="angucomplete-searching" ng-show="searching" ng-bind="textSearching"></div>' +
        '    <div class="angucomplete-searching" ng-show="!searching && (!results || results.length == 0)" ng-bind="textNoResults"></div>' +
        '    <div class="angucomplete-row" ng-repeat="result in results" ng-click="selectResult(result)" ng-mouseenter="hoverRow($index)" ng-class="{\'angucomplete-selected-row\': $index == currentIndex}">' +
        '      <div ng-if="imageField" class="angucomplete-image-holder">' +
        '        <img ng-if="result.image && result.image != \'\'" ng-src="{{result.image}}" class="angucomplete-image"/>' +
        '        <div ng-if="!result.image && result.image != \'\'" class="angucomplete-image-default"></div>' +
        '      </div>' +
        '      <div class="angucomplete-title" ng-if="matchClass" ng-bind-html="result.title"></div>' +
        '      <div class="angucomplete-title" ng-if="!matchClass">{{ result.title }}</div>' +
        '      <div ng-if="matchClass && result.description && result.description != \'\'" class="angucomplete-description" ng-bind-html="result.description"></div>' +
        '      <div ng-if="!matchClass && result.description && result.description != \'\'" class="angucomplete-description">{{result.description}}</div>' +
        '    </div>' +
        '  </div>' +
        '</div>'
    );

    function link(scope, elem, attrs, ctrl) {
        var inputField = elem.find("input[id*='_value']");
        var inputKeyField = elem.find("input[id*='_key']");
      var minlength = MIN_LENGTH;
      var searchTimer = null;
      var hideTimer;
      var requiredClassName = REQUIRED_CLASS;
      var responseFormatter;
      var validState = null;
      var httpCanceller = null;
      var dd = elem[0].querySelector('.angucomplete-dropdown');
      var isScrollOn = false;
      var mousedownOn = null;
      var unbindInitialValue;
      var displaySearching;
      var displayNoResults;

      elem.on('mousedown', function(event) {
        if (event.target.id) {
          mousedownOn = event.target.id;
          if (mousedownOn === scope.id + '_dropdown') {
            document.body.addEventListener('click', clickoutHandlerForDropdown);
          }
        }
        else {
          mousedownOn = event.target.className;
        }
      });

      scope.currentIndex = null;
      scope.searching = false;
      unbindInitialValue = scope.$watch('initialValue', function(newval, oldval) {

        if (newval) {
          unbindInitialValue();

          if (typeof newval === 'object') {
            scope.searchStr = extractTitle(newval);
              scope.searchKey = extractValue(newval, scope.keyField);
            callOrAssign({originalObject: newval});
          } else if (typeof newval === 'string' && newval.length > 0) {
            scope.searchStr = newval;
          } else {
            if (console && console.error) {
              console.error('Tried to set initial value of angucomplete to', newval, 'which is an invalid value');
            }
          }

          handleRequired(true);
        }
      });

      scope.$on('angucomplete-alt:clearInput', function (event, elementId) {
        if (!elementId || elementId === scope.id) {
          scope.searchStr = null;
            scope.searchKey = null;
          callOrAssign();
          handleRequired(false);
          clearResults();
        }
      });

      // #194 dropdown list not consistent in collapsing (bug).
      function clickoutHandlerForDropdown(event) {
        mousedownOn = null;
        scope.hideResults(event);
        document.body.removeEventListener('click', clickoutHandlerForDropdown);
      }

      // for IE8 quirkiness about event.which
      function ie8EventNormalizer(event) {
        return event.which ? event.which : event.keyCode;
      }

      function callOrAssign(value) {
        if (typeof scope.selectedObject === 'function') {
          scope.selectedObject(value);
        }
        else {
          scope.selectedObject = value;
        }

        if (value) {
          handleRequired(true);
        }
        else {
          handleRequired(false);
        }
      }

      function callFunctionOrIdentity(fn) {
        return function(data) {
            if (typeof data == "string") data = JSON.parse(data);
          return scope[fn] ? scope[fn](data) : data;
        };
      }

      function setInputString(str) {
        callOrAssign({originalObject: str});

        if (scope.clearSelected) {
          scope.searchStr = null;
            scope.searchKey = null;
        }
        clearResults();
      }

      function extractTitle(data) {
        // split title fields and run extractValue for each and join with ' '
        return scope.titleField.split(',')
          .map(function(field) {
            return extractValue(data, field);
          })
          .join(' ');
      }

      function extractValue(obj, key) {
        var keys, result;
        if (key) {
          keys= key.split('.');
          result = obj;
          for (var i = 0; i < keys.length; i++) {
            result = result[keys[i]];
          }
        }
        else {
          result = obj;
        }
        return result;
      }

      function findMatchString(target, str) {
        var result, matches, re;
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
        // Escape user input to be treated as a literal string within a regular expression
        re = new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (!target) { return; }
        if (!target.match || !target.replace) { target = target.toString(); }
        matches = target.match(re);
        if (matches) {
          result = target.replace(re,
              '<span class="'+ scope.matchClass +'">'+ matches[0] +'</span>');
        }
        else {
          result = target;
        }
        return $sce.trustAsHtml(result);
      }

      function handleRequired(valid) {
        scope.notEmpty = valid;
        validState = scope.searchStr;
        if (scope.fieldRequired && ctrl) {
          ctrl.$setValidity(requiredClassName, valid);
        }
      }

      function keyupHandler(event) {
        var which = ie8EventNormalizer(event);
        if (which === KEY_LF || which === KEY_RT) {
          // do nothing
          return;
        }

        if (which === KEY_UP || which === KEY_EN) {
          event.preventDefault();
        }
        else if (which === KEY_DW) {
          event.preventDefault();
          if (!scope.showDropdown && scope.searchStr && scope.searchStr.length >= minlength) {
            initResults();
            scope.searching = true;
            searchTimerComplete(scope.searchStr);
          }
        }
        else if (which === KEY_ES) {
          clearResults();
          scope.$apply(function() {
            inputField.val(scope.searchStr);
              inputKeyField.val(scope.searchKey);
          });
        }
        else {
          if (minlength === 0 && !scope.searchStr) {
            return;
          }

          if (!scope.searchStr || scope.searchStr === '') {
            scope.showDropdown = false;
          } else if (scope.searchStr.length >= minlength) {
            initResults();

            if (searchTimer) {
              $timeout.cancel(searchTimer);
            }

            scope.searching = true;

            searchTimer = $timeout(function() {
              searchTimerComplete(scope.searchStr);
            }, scope.pause);
          }

          if (validState && validState !== scope.searchStr && !scope.clearSelected) {
            scope.$apply(function() {
              callOrAssign();
            });
          }
        }
      }

      function handleOverrideSuggestions(event) {
        if (scope.overrideSuggestions &&
            !(scope.selectedObject && scope.selectedObject.originalObject === scope.searchStr)) {
          if (event) {
            event.preventDefault();
          }
          setInputString(scope.searchStr);
        }
      }

      function dropdownRowOffsetHeight(row) {
        var css = getComputedStyle(row);
        return row.offsetHeight +
          parseInt(css.marginTop, 10) + parseInt(css.marginBottom, 10);
      }

      function dropdownHeight() {
        return dd.getBoundingClientRect().top +
          parseInt(getComputedStyle(dd).maxHeight, 10);
      }

      function dropdownRow() {
        return elem[0].querySelectorAll('.angucomplete-row')[scope.currentIndex];
      }

      function dropdownRowTop() {
        return dropdownRow().getBoundingClientRect().top -
          (dd.getBoundingClientRect().top +
           parseInt(getComputedStyle(dd).paddingTop, 10));
      }

      function dropdownScrollTopTo(offset) {
        dd.scrollTop = dd.scrollTop + offset;
      }

      function updateInputField(){
        var current = scope.results[scope.currentIndex];
        if (scope.matchClass) {
          inputField.val(extractTitle(current.originalObject));
            inputKeyField.val(extractValue(current.originalObject,scope.keyField));
        }
        else {
          inputField.val(current.title);
            inputKeyField.val(current.key)
        }
      }

      function keydownHandler(event) {
        var which = ie8EventNormalizer(event);
        var row = null;
        var rowTop = null;

        if (which === KEY_EN && scope.results) {
          if (scope.currentIndex >= 0 && scope.currentIndex < scope.results.length) {
            event.preventDefault();
            scope.selectResult(scope.results[scope.currentIndex]);
          } else {
            handleOverrideSuggestions(event);
            clearResults();
          }
          scope.$apply();
        } else if (which === KEY_DW && scope.results) {
          event.preventDefault();
          if ((scope.currentIndex + 1) < scope.results.length && scope.showDropdown) {
            scope.$apply(function() {
              scope.currentIndex ++;
              updateInputField();
            });

            if (isScrollOn) {
              row = dropdownRow();
              if (dropdownHeight() < row.getBoundingClientRect().bottom) {
                dropdownScrollTopTo(dropdownRowOffsetHeight(row));
              }
            }
          }
        } else if (which === KEY_UP && scope.results) {
          event.preventDefault();
          if (scope.currentIndex >= 1) {
            scope.$apply(function() {
              scope.currentIndex --;
              updateInputField();
            });

            if (isScrollOn) {
              rowTop = dropdownRowTop();
              if (rowTop < 0) {
                dropdownScrollTopTo(rowTop - 1);
              }
            }
          }
          else if (scope.currentIndex === 0) {
            scope.$apply(function() {
              scope.currentIndex = -1;
              inputField.val(scope.searchStr);
                inputKeyField.val(scope.searchKey);
            });
          }
        } else if (which === KEY_TAB) {
          if (scope.results && scope.results.length > 0 && scope.showDropdown) {
            if (scope.currentIndex === -1 && scope.overrideSuggestions) {
              // intentionally not sending event so that it does not
              // prevent default tab behavior
              handleOverrideSuggestions();
            }
            else {
              if (scope.currentIndex === -1) {
                scope.currentIndex = 0;
              }
              scope.selectResult(scope.results[scope.currentIndex]);
              scope.$digest();
            }
          }
          else {
            // no results
            // intentionally not sending event so that it does not
            // prevent default tab behavior
            if (scope.searchStr && scope.searchStr.length > 0) {
              handleOverrideSuggestions();
            }
          }
        }
      }

      function httpSuccessCallbackGen(str) {
        return function(responseData, status, headers, config) {
          // normalize return obejct from promise
          if (!status && !headers && !config) {
            responseData = responseData.data;
          }
          scope.searching = false;
          processResults(
            extractValue(responseFormatter(responseData), scope.remoteUrlDataField),
            str);
        };
      }

      function httpErrorCallback(errorRes, status, headers, config) {
        // normalize return obejct from promise
        if (!status && !headers && !config) {
          status = errorRes.status;
        }
        if (status !== 0) {
          if (scope.remoteUrlErrorCallback) {
            scope.remoteUrlErrorCallback(errorRes, status, headers, config);
          }
          else {
            if (console && console.error) {
              console.error('http error');
            }
          }
        }
      }

      function cancelHttpRequest() {
        if (httpCanceller) {
          httpCanceller.resolve();
        }
      }

      function getRemoteResults(str) {
        var params = {},
            url = scope.remoteUrl + encodeURIComponent(str);
        if (scope.remoteUrlRequestFormatter) {
          params = {params: scope.remoteUrlRequestFormatter(str)};
          url = scope.remoteUrl;
        }
        if (!!scope.remoteUrlRequestWithCredentials) {
          params.withCredentials = true;
        }
        cancelHttpRequest();
        httpCanceller = $q.defer();
        params.timeout = httpCanceller.promise;
        $http.get(url, params)
          .success(httpSuccessCallbackGen(str))
          .error(httpErrorCallback);
      }

      function getRemoteResultsWithCustomHandler(str) {
        cancelHttpRequest();

        httpCanceller = $q.defer();

        scope.remoteApiHandler(str, httpCanceller.promise)
          .then(httpSuccessCallbackGen(str))
          .catch(httpErrorCallback);

        /* IE8 compatible
        scope.remoteApiHandler(str, httpCanceller.promise)
          ['then'](httpSuccessCallbackGen(str))
          ['catch'](httpErrorCallback);
        */
      }

      function clearResults() {
        scope.showDropdown = false;
        scope.results = [];
        if (dd) {
          dd.scrollTop = 0;
        }
      }

      function initResults() {
        scope.showDropdown = displaySearching;
        scope.currentIndex = -1;
        scope.results = [];
      }

      function getLocalResults(str) {
        var i, match, s, value,
            searchFields = scope.searchFields.split(','),
            matches = [];

        for (i = 0; i < scope.localData.length; i++) {
          match = false;

          for (s = 0; s < searchFields.length; s++) {
            value = extractValue(scope.localData[i], searchFields[s]) || '';
            match = match || (value.toString().toLowerCase().indexOf(str.toString().toLowerCase()) >= 0);
          }

          if (match) {
            matches[matches.length] = scope.localData[i];
          }
        }

        scope.searching = false;
        processResults(matches, str);
      }

      function checkExactMatch(result, obj, str){
        if (!str) { return; }
        for(var key in obj){
          if(obj[key].toLowerCase() === str.toLowerCase()){
            scope.selectResult(result);
            return;
          }
        }
      }

      function searchTimerComplete(str) {
        // Begin the search
        if (!str || str.length < minlength) {
          return;
        }
        if (scope.localData) {
          scope.$apply(function() {
            getLocalResults(str);
          });
        }
        else if (scope.remoteApiHandler) {
          getRemoteResultsWithCustomHandler(str);
        } else {
          getRemoteResults(str);
        }
      }

      function processResults(responseData, str) {
        var i, description, image, key, text, formattedText, formattedDesc;

        if (responseData && responseData.length > 0) {
          scope.results = [];

          for (i = 0; i < responseData.length; i++) {
            if (scope.titleField && scope.titleField !== '') {
              text = formattedText = extractTitle(responseData[i]);
            }

            description = '';
            if (scope.descriptionField) {
              description = formattedDesc = extractValue(responseData[i], scope.descriptionField);
            }

            image = '';
            if (scope.imageField) {
              image = extractValue(responseData[i], scope.imageField);
            }

              key = '';
              if (scope.keyField) {
                  key = extractValue(responseData[i], scope.keyField);
              }

            if (scope.matchClass) {
              formattedText = findMatchString(text, str);
              formattedDesc = findMatchString(description, str);
            }

            scope.results[scope.results.length] = {
              title: formattedText,
              description: formattedDesc,
              image: image,
                key:key,
              originalObject: responseData[i]
            };

            if (scope.autoMatch) {
              checkExactMatch(scope.results[scope.results.length-1],
                  {title: text, desc: description || ''}, scope.searchStr);
            }
          }

        } else {
          scope.results = [];
        }

        if (scope.results.length === 0 && !displayNoResults) {
          scope.showDropdown = false;
        } else {
          scope.showDropdown = true;
        }
      }

      function showAll() {
        if (scope.localData) {
          processResults(scope.localData, '');
        }
        else if (scope.remoteApiHandler) {
          getRemoteResultsWithCustomHandler('');
        }
        else {
          getRemoteResults('');
        }
      }

      scope.onFocusHandler = function() {
        if (scope.focusIn) {
          scope.focusIn();
        }
        if (minlength === 0 && (!scope.searchStr || scope.searchStr.length === 0)) {
          scope.showDropdown = true;
          showAll();
        }
      };

      scope.hideResults = function(event) {
        if (mousedownOn &&
            (mousedownOn === scope.id + '_dropdown' ||
             mousedownOn.indexOf('angucomplete') >= 0)) {
          mousedownOn = null;
        }
        else {
          hideTimer = $timeout(function() {
            clearResults();
            scope.$apply(function() {
              if (scope.searchStr && scope.searchStr.length > 0) {
                inputField.val(scope.searchStr);
                  inputKeyField.val(scope.searchKey);
              }
            });
          }, BLUR_TIMEOUT);
          cancelHttpRequest();

          if (scope.focusOut) {
            scope.focusOut();
          }

          if (scope.overrideSuggestions) {
            if (scope.searchStr && scope.searchStr.length > 0 && scope.currentIndex === -1) {
              handleOverrideSuggestions();
            }
          }
        }
      };

      scope.resetHideResults = function() {
        if (hideTimer) {
          $timeout.cancel(hideTimer);
        }
      };

      scope.hoverRow = function(index) {
        scope.currentIndex = index;
      };

      scope.selectResult = function(result) {
        // Restore original values
        if (scope.matchClass) {
          result.title = extractTitle(result.originalObject);
          result.description = extractValue(result.originalObject, scope.descriptionField);
            result.key = extractValue(result.originalObject, scope.keyField);
        }

        if (scope.clearSelected) {
          scope.searchStr = null;
            scope.searchKey = null;
        }
        else {
          scope.searchStr = result.title;
            scope.searchKey = result.key;
        }
        callOrAssign(result);
        clearResults();
      };

      scope.inputChangeHandler = function(str) {
        if (str.length < minlength) {
          clearResults();
        }
        else if (str.length === 0 && minlength === 0) {
          scope.searching = false;
          showAll();
        }

        if (scope.inputChanged) {
          str = scope.inputChanged(str);
        }
        return str;
      };

      // check required
      if (scope.fieldRequiredClass && scope.fieldRequiredClass !== '') {
        requiredClassName = scope.fieldRequiredClass;
      }

      // check min length
      if (scope.minlength && scope.minlength !== '') {
        minlength = parseInt(scope.minlength, 10);
      }

      // check pause time
      if (!scope.pause) {
        scope.pause = PAUSE;
      }

      // check clearSelected
      if (!scope.clearSelected) {
        scope.clearSelected = false;
      }

      // check override suggestions
      if (!scope.overrideSuggestions) {
        scope.overrideSuggestions = false;
      }

      // check required field
      if (scope.fieldRequired && ctrl) {
        // check initial value, if given, set validitity to true
        if (scope.initialValue) {
          handleRequired(true);
        }
        else {
          handleRequired(false);
        }
      }

      scope.inputType = attrs.type ? attrs.type : 'text';

      // set strings for "Searching..." and "No results"
      scope.textSearching = attrs.textSearching ? attrs.textSearching : TEXT_SEARCHING;
      scope.textNoResults = attrs.textNoResults ? attrs.textNoResults : TEXT_NORESULTS;
      displaySearching = scope.textSearching === 'false' ? false : true;
      displayNoResults = scope.textNoResults === 'false' ? false : true;

      // set max length (default to maxlength deault from html
      scope.maxlength = attrs.maxlength ? attrs.maxlength : MAX_LENGTH;

      // register events
      inputField.bind('keydown', keydownHandler);
      inputField.bind('keyup', keyupHandler);

      // set response formatter
      responseFormatter = callFunctionOrIdentity('remoteUrlResponseFormatter');

      scope.$on('$destroy', function() {
        // take care of required validity when it gets destroyed
        handleRequired(true);
      });

      // set isScrollOn
      $timeout(function() {
        var css = getComputedStyle(dd);
        isScrollOn = css.maxHeight && css.overflowY === 'auto';
      });
    }

    return {
      restrict: 'EA',
      require: '^?form',
      scope: {
        selectedObject: '=',
        disableInput: '=',
        initialValue: '=',
        localData: '=',
        remoteUrlRequestFormatter: '=',
        remoteUrlRequestWithCredentials: '@',
        remoteUrlResponseFormatter: '=',
        remoteUrlErrorCallback: '=',
        remoteApiHandler: '=',
        id: '@',
        type: '@',
        placeholder: '@',
        remoteUrl: '@',
        remoteUrlDataField: '@',
        titleField: '@',
        descriptionField: '@',
        imageField: '@',
          keyField: '@',
        inputClass: '@',
        pause: '@',
        searchFields: '@',
        minlength: '@',
        matchClass: '@',
        clearSelected: '@',
        overrideSuggestions: '@',
        fieldRequired: '@',
        fieldRequiredClass: '@',
        inputChanged: '=',
        autoMatch: '@',
        focusOut: '&',
        focusIn: '&',
        inputName: '@'
      },
      templateUrl: function(element, attrs) {
        return attrs.templateUrl || TEMPLATE_URL;
      },
      compile: function(tElement, tAttrs) {
        var startSym = $interpolate.startSymbol();
        var endSym = $interpolate.endSymbol();
        if (!(startSym === '{{' && endSym === '}}')) {
          var interpolatedHtml = tElement.html()
            .replace(/\{\{/g, startSym)
            .replace(/\}\}/g, endSym);
          tElement.html(interpolatedHtml);
        }
        return link;
      }
    };
  }]);

}));

/*
 * File Upload directive for AngularJS
 * angular-file-upload v1.1.5
 * https://github.com/nervgh/angular-file-upload
 * By nerv
 */
(function(angular, factory) {
    if (typeof define === 'function' && define.amd) {
        define('angular-file-upload', ['angular'], function(angular) {
            return factory(angular);
        });
    } else {
        return factory(angular);
    }
}(typeof angular === 'undefined' ? null : angular, function(angular) {

    var module = angular.module('angularFileUpload', []);

    /**
     * Classes
     *
     * FileUploader
     * FileUploader.FileLikeObject
     * FileUploader.FileItem
     * FileUploader.FileDirective
     * FileUploader.FileSelect
     * FileUploader.FileDrop
     * FileUploader.FileOver
     */

    module

        .value('fileUploaderOptions', {
            url: '/',
            alias: 'file',
            headers: {},
            queue: [],
            progress: 0,
            autoUpload: false,
            removeAfterUpload: false,
            method: 'POST',
            filters: [],
            formData: [],
            queueLimit: Number.MAX_VALUE,
            withCredentials: false
        })


        .factory('FileUploader', ['fileUploaderOptions', '$rootScope', '$http', '$window', '$compile',
            function(fileUploaderOptions, $rootScope, $http, $window, $compile) {
                /**
                 * Creates an instance of FileUploader
                 * @param {Object} [options]
                 * @constructor
                 */
                function FileUploader(options) {
                    var settings = angular.copy(fileUploaderOptions);
                    angular.extend(this, settings, options, {
                        isUploading: false,
                        _nextIndex: 0,
                        _failFilterIndex: -1,
                        _directives: {select: [], drop: [], over: []}
                    });

                    // add default filters
                    this.filters.unshift({name: 'queueLimit', fn: this._queueLimitFilter});
                    this.filters.unshift({name: 'folder', fn: this._folderFilter});
                }
                /**********************
                 * PUBLIC
                 **********************/
                /**
                 * Checks a support the html5 uploader
                 * @returns {Boolean}
                 * @readonly
                 */
                FileUploader.prototype.isHTML5 = !!($window.File && $window.FormData);
                /**
                 * Adds items to the queue
                 * @param {File|HTMLInputElement|Object|FileList|Array<Object>} files
                 * @param {Object} [options]
                 * @param {Array<Function>|String} filters
                 */
                FileUploader.prototype.addToQueue = function(files, options, filters) {
                    var list = this.isArrayLikeObject(files) ? files: [files];
                    var arrayOfFilters = this._getFilters(filters);
                    var count = this.queue.length;
                    var addedFileItems = [];

                    angular.forEach(list, function(some /*{File|HTMLInputElement|Object}*/) {
                        var temp = new FileUploader.FileLikeObject(some);

                        if (this._isValidFile(temp, arrayOfFilters, options)) {
                            var fileItem = new FileUploader.FileItem(this, some, options);
                            addedFileItems.push(fileItem);
                            this.queue.push(fileItem);
                            this._onAfterAddingFile(fileItem);
                        } else {
                            var filter = this.filters[this._failFilterIndex];
                            this._onWhenAddingFileFailed(temp, filter, options);
                        }
                    }, this);

                    if(this.queue.length !== count) {
                        this._onAfterAddingAll(addedFileItems);
                        this.progress = this._getTotalProgress();
                    }

                    this._render();
                    if (this.autoUpload) this.uploadAll();
                };
                /**
                 * Remove items from the queue. Remove last: index = -1
                 * @param {FileItem|Number} value
                 */
                FileUploader.prototype.removeFromQueue = function(value) {
                    var index = this.getIndexOfItem(value);
                    var item = this.queue[index];
                    if (item.isUploading) item.cancel();
                    this.queue.splice(index, 1);
                    item._destroy();
                    this.progress = this._getTotalProgress();
                };
                /**
                 * Clears the queue
                 */
                FileUploader.prototype.clearQueue = function() {
                    while(this.queue.length) {
                        this.queue[0].remove();
                    }
                    this.progress = 0;
                };
                /**
                 * Uploads a item from the queue
                 * @param {FileItem|Number} value
                 */
                FileUploader.prototype.uploadItem = function(value) {
                    var index = this.getIndexOfItem(value);
                    var item = this.queue[index];
                    var transport = this.isHTML5 ? '_xhrTransport' : '_iframeTransport';

                    item._prepareToUploading();
                    if(this.isUploading) return;

                    this.isUploading = true;
                    this[transport](item);
                };
                /**
                 * Cancels uploading of item from the queue
                 * @param {FileItem|Number} value
                 */
                FileUploader.prototype.cancelItem = function(value) {
                    var index = this.getIndexOfItem(value);
                    var item = this.queue[index];
                    var prop = this.isHTML5 ? '_xhr' : '_form';
                    if (item && item.isUploading) item[prop].abort();
                };
                /**
                 * Uploads all not uploaded items of queue
                 */
                FileUploader.prototype.uploadAll = function() {
                    var items = this.getNotUploadedItems().filter(function(item) {
                        return !item.isUploading;
                    });
                    if (!items.length) return;

                    angular.forEach(items, function(item) {
                        item._prepareToUploading();
                    });
                    items[0].upload();
                };
                /**
                 * Cancels all uploads
                 */
                FileUploader.prototype.cancelAll = function() {
                    var items = this.getNotUploadedItems();
                    angular.forEach(items, function(item) {
                        item.cancel();
                    });
                };
                /**
                 * Returns "true" if value an instance of File
                 * @param {*} value
                 * @returns {Boolean}
                 * @private
                 */
                FileUploader.prototype.isFile = function(value) {
                    var fn = $window.File;
                    return (fn && value instanceof fn);
                };
                /**
                 * Returns "true" if value an instance of FileLikeObject
                 * @param {*} value
                 * @returns {Boolean}
                 * @private
                 */
                FileUploader.prototype.isFileLikeObject = function(value) {
                    return value instanceof FileUploader.FileLikeObject;
                };
                /**
                 * Returns "true" if value is array like object
                 * @param {*} value
                 * @returns {Boolean}
                 */
                FileUploader.prototype.isArrayLikeObject = function(value) {
                    return (angular.isObject(value) && 'length' in value);
                };
                /**
                 * Returns a index of item from the queue
                 * @param {Item|Number} value
                 * @returns {Number}
                 */
                FileUploader.prototype.getIndexOfItem = function(value) {
                    return angular.isNumber(value) ? value : this.queue.indexOf(value);
                };
                /**
                 * Returns not uploaded items
                 * @returns {Array}
                 */
                FileUploader.prototype.getNotUploadedItems = function() {
                    return this.queue.filter(function(item) {
                        return !item.isUploaded;
                    });
                };
                /**
                 * Returns items ready for upload
                 * @returns {Array}
                 */
                FileUploader.prototype.getReadyItems = function() {
                    return this.queue
                        .filter(function(item) {
                            return (item.isReady && !item.isUploading);
                        })
                        .sort(function(item1, item2) {
                            return item1.index - item2.index;
                        });
                };
                /**
                 * Destroys instance of FileUploader
                 */
                FileUploader.prototype.destroy = function() {
                    angular.forEach(this._directives, function(key) {
                        angular.forEach(this._directives[key], function(object) {
                            object.destroy();
                        }, this);
                    }, this);
                };
                /**
                 * Callback
                 * @param {Array} fileItems
                 */
                FileUploader.prototype.onAfterAddingAll = function(fileItems) {};
                /**
                 * Callback
                 * @param {FileItem} fileItem
                 */
                FileUploader.prototype.onAfterAddingFile = function(fileItem) {};
                /**
                 * Callback
                 * @param {File|Object} item
                 * @param {Object} filter
                 * @param {Object} options
                 * @private
                 */
                FileUploader.prototype.onWhenAddingFileFailed = function(item, filter, options) {};
                /**
                 * Callback
                 * @param {FileItem} fileItem
                 */
                FileUploader.prototype.onBeforeUploadItem = function(fileItem) {};
                /**
                 * Callback
                 * @param {FileItem} fileItem
                 * @param {Number} progress
                 */
                FileUploader.prototype.onProgressItem = function(fileItem, progress) {};
                /**
                 * Callback
                 * @param {Number} progress
                 */
                FileUploader.prototype.onProgressAll = function(progress) {};
                /**
                 * Callback
                 * @param {FileItem} item
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 */
                FileUploader.prototype.onSuccessItem = function(item, response, status, headers) {};
                /**
                 * Callback
                 * @param {FileItem} item
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 */
                FileUploader.prototype.onErrorItem = function(item, response, status, headers) {};
                /**
                 * Callback
                 * @param {FileItem} item
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 */
                FileUploader.prototype.onCancelItem = function(item, response, status, headers) {};
                /**
                 * Callback
                 * @param {FileItem} item
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 */
                FileUploader.prototype.onCompleteItem = function(item, response, status, headers) {};
                /**
                 * Callback
                 */
                FileUploader.prototype.onCompleteAll = function() {};
                /**********************
                 * PRIVATE
                 **********************/
                /**
                 * Returns the total progress
                 * @param {Number} [value]
                 * @returns {Number}
                 * @private
                 */
                FileUploader.prototype._getTotalProgress = function(value) {
                    if(this.removeAfterUpload) return value || 0;

                    var notUploaded = this.getNotUploadedItems().length;
                    var uploaded = notUploaded ? this.queue.length - notUploaded : this.queue.length;
                    var ratio = 100 / this.queue.length;
                    var current = (value || 0) * ratio / 100;

                    return Math.round(uploaded * ratio + current);
                };
                /**
                 * Returns array of filters
                 * @param {Array<Function>|String} filters
                 * @returns {Array<Function>}
                 * @private
                 */
                FileUploader.prototype._getFilters = function(filters) {
                    if (angular.isUndefined(filters)) return this.filters;
                    if (angular.isArray(filters)) return filters;
                    var names = filters.match(/[^\s,]+/g);
                    return this.filters.filter(function(filter) {
                        return names.indexOf(filter.name) !== -1;
                    }, this);
                };
                /**
                 * Updates html
                 * @private
                 */
                FileUploader.prototype._render = function() {
                    if (!$rootScope.$$phase) $rootScope.$apply();
                };
                /**
                 * Returns "true" if item is a file (not folder)
                 * @param {File|FileLikeObject} item
                 * @returns {Boolean}
                 * @private
                 */
                FileUploader.prototype._folderFilter = function(item) {
                    return !!(item.size || item.type);
                };
                /**
                 * Returns "true" if the limit has not been reached
                 * @returns {Boolean}
                 * @private
                 */
                FileUploader.prototype._queueLimitFilter = function() {
                    return this.queue.length < this.queueLimit;
                };
                /**
                 * Returns "true" if file pass all filters
                 * @param {File|Object} file
                 * @param {Array<Function>} filters
                 * @param {Object} options
                 * @returns {Boolean}
                 * @private
                 */
                FileUploader.prototype._isValidFile = function(file, filters, options) {
                    this._failFilterIndex = -1;
                    return !filters.length ? true : filters.every(function(filter) {
                        this._failFilterIndex++;
                        return filter.fn.call(this, file, options);
                    }, this);
                };
                /**
                 * Checks whether upload successful
                 * @param {Number} status
                 * @returns {Boolean}
                 * @private
                 */
                FileUploader.prototype._isSuccessCode = function(status) {
                    return (status >= 200 && status < 300) || status === 304;
                };
                /**
                 * Transforms the server response
                 * @param {*} response
                 * @param {Object} headers
                 * @returns {*}
                 * @private
                 */
                FileUploader.prototype._transformResponse = function(response, headers) {
                    var headersGetter = this._headersGetter(headers);
                    angular.forEach($http.defaults.transformResponse, function(transformFn) {
                        response = transformFn(response, headersGetter);
                    });
                    return response;
                };
                /**
                 * Parsed response headers
                 * @param headers
                 * @returns {Object}
                 * @see https://github.com/angular/angular.js/blob/master/src/ng/http.js
                 * @private
                 */
                FileUploader.prototype._parseHeaders = function(headers) {
                    var parsed = {}, key, val, i;

                    if (!headers) return parsed;

                    angular.forEach(headers.split('\n'), function(line) {
                        i = line.indexOf(':');
                        key = line.slice(0, i).trim().toLowerCase();
                        val = line.slice(i + 1).trim();

                        if (key) {
                            parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
                        }
                    });

                    return parsed;
                };
                /**
                 * Returns function that returns headers
                 * @param {Object} parsedHeaders
                 * @returns {Function}
                 * @private
                 */
                FileUploader.prototype._headersGetter = function(parsedHeaders) {
                    return function(name) {
                        if (name) {
                            return parsedHeaders[name.toLowerCase()] || null;
                        }
                        return parsedHeaders;
                    };
                };
                /**
                 * The XMLHttpRequest transport
                 * @param {FileItem} item
                 * @private
                 */
                FileUploader.prototype._xhrTransport = function(item) {
                    var xhr = item._xhr = new XMLHttpRequest();
                    var form = new FormData();
                    var that = this;

                    that._onBeforeUploadItem(item);

                    angular.forEach(item.formData, function(obj) {
                        angular.forEach(obj, function(value, key) {
                            form.append(key, value);
                        });
                    });

                    form.append(item.alias, item._file, item.file.name);

                    xhr.upload.onprogress = function(event) {
                        var progress = Math.round(event.lengthComputable ? event.loaded * 100 / event.total : 0);
                        that._onProgressItem(item, progress);
                    };

                    xhr.onload = function() {
                        var headers = that._parseHeaders(xhr.getAllResponseHeaders());
                        var response = that._transformResponse(xhr.response, headers);
                        var gist = that._isSuccessCode(xhr.status) ? 'Success' : 'Error';
                        var method = '_on' + gist + 'Item';
                        that[method](item, response, xhr.status, headers);
                        that._onCompleteItem(item, response, xhr.status, headers);
                    };

                    xhr.onerror = function() {
                        var headers = that._parseHeaders(xhr.getAllResponseHeaders());
                        var response = that._transformResponse(xhr.response, headers);
                        that._onErrorItem(item, response, xhr.status, headers);
                        that._onCompleteItem(item, response, xhr.status, headers);
                    };

                    xhr.onabort = function() {
                        var headers = that._parseHeaders(xhr.getAllResponseHeaders());
                        var response = that._transformResponse(xhr.response, headers);
                        that._onCancelItem(item, response, xhr.status, headers);
                        that._onCompleteItem(item, response, xhr.status, headers);
                    };

                    xhr.open(item.method, item.url, true);

                    xhr.withCredentials = item.withCredentials;

                    angular.forEach(item.headers, function(value, name) {
                        xhr.setRequestHeader(name, value);
                    });

                    xhr.send(form);
                    this._render();
                };
                /**
                 * The IFrame transport
                 * @param {FileItem} item
                 * @private
                 */
                FileUploader.prototype._iframeTransport = function(item) {
                    var form = angular.element('<form style="display: none;" />');
                    var iframe = angular.element('<iframe name="iframeTransport' + Date.now() + '">');
                    var input = item._input;
                    var that = this;

                    if (item._form) item._form.replaceWith(input); // remove old form
                    item._form = form; // save link to new form

                    that._onBeforeUploadItem(item);

                    input.prop('name', item.alias);

                    angular.forEach(item.formData, function(obj) {
                        angular.forEach(obj, function(value, key) {
                            var element = angular.element('<input type="hidden" name="' + key + '" />');
                            element.val(value);
                            form.append(element);
                        });
                    });

                    form.prop({
                        action: item.url,
                        method: 'POST',
                        target: iframe.prop('name'),
                        enctype: 'multipart/form-data',
                        encoding: 'multipart/form-data' // old IE
                    });

                    iframe.bind('load', function() {
                        try {
                            // Fix for legacy IE browsers that loads internal error page
                            // when failed WS response received. In consequence iframe
                            // content access denied error is thrown becouse trying to
                            // access cross domain page. When such thing occurs notifying
                            // with empty response object. See more info at:
                            // http://stackoverflow.com/questions/151362/access-is-denied-error-on-accessing-iframe-document-object
                            // Note that if non standard 4xx or 5xx error code returned
                            // from WS then response content can be accessed without error
                            // but 'XHR' status becomes 200. In order to avoid confusion
                            // returning response via same 'success' event handler.

                            // fixed angular.contents() for iframes
                            var html = iframe[0].contentDocument.body.innerHTML;
                        } catch (e) {}

                        var xhr = {response: html, status: 200, dummy: true};
                        var headers = {};
                        var response = that._transformResponse(xhr.response, headers);

                        that._onSuccessItem(item, response, xhr.status, headers);
                        that._onCompleteItem(item, response, xhr.status, headers);
                    });

                    form.abort = function() {
                        var xhr = {status: 0, dummy: true};
                        var headers = {};
                        var response;

                        iframe.unbind('load').prop('src', 'javascript:false;');
                        form.replaceWith(input);

                        that._onCancelItem(item, response, xhr.status, headers);
                        that._onCompleteItem(item, response, xhr.status, headers);
                    };

                    input.after(form);
                    form.append(input).append(iframe);

                    form[0].submit();
                    this._render();
                };
                /**
                 * Inner callback
                 * @param {File|Object} item
                 * @param {Object} filter
                 * @param {Object} options
                 * @private
                 */
                FileUploader.prototype._onWhenAddingFileFailed = function(item, filter, options) {
                    this.onWhenAddingFileFailed(item, filter, options);
                };
                /**
                 * Inner callback
                 * @param {FileItem} item
                 */
                FileUploader.prototype._onAfterAddingFile = function(item) {
                    this.onAfterAddingFile(item);
                };
                /**
                 * Inner callback
                 * @param {Array<FileItem>} items
                 */
                FileUploader.prototype._onAfterAddingAll = function(items) {
                    this.onAfterAddingAll(items);
                };
                /**
                 *  Inner callback
                 * @param {FileItem} item
                 * @private
                 */
                FileUploader.prototype._onBeforeUploadItem = function(item) {
                    item._onBeforeUpload();
                    this.onBeforeUploadItem(item);
                };
                /**
                 * Inner callback
                 * @param {FileItem} item
                 * @param {Number} progress
                 * @private
                 */
                FileUploader.prototype._onProgressItem = function(item, progress) {
                    var total = this._getTotalProgress(progress);
                    this.progress = total;
                    item._onProgress(progress);
                    this.onProgressItem(item, progress);
                    this.onProgressAll(total);
                    this._render();
                };
                /**
                 * Inner callback
                 * @param {FileItem} item
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 * @private
                 */
                FileUploader.prototype._onSuccessItem = function(item, response, status, headers) {
                    item._onSuccess(response, status, headers);
                    this.onSuccessItem(item, response, status, headers);
                };
                /**
                 * Inner callback
                 * @param {FileItem} item
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 * @private
                 */
                FileUploader.prototype._onErrorItem = function(item, response, status, headers) {
                    item._onError(response, status, headers);
                    this.onErrorItem(item, response, status, headers);
                };
                /**
                 * Inner callback
                 * @param {FileItem} item
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 * @private
                 */
                FileUploader.prototype._onCancelItem = function(item, response, status, headers) {
                    item._onCancel(response, status, headers);
                    this.onCancelItem(item, response, status, headers);
                };
                /**
                 * Inner callback
                 * @param {FileItem} item
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 * @private
                 */
                FileUploader.prototype._onCompleteItem = function(item, response, status, headers) {
                    item._onComplete(response, status, headers);
                    this.onCompleteItem(item, response, status, headers);

                    var nextItem = this.getReadyItems()[0];
                    this.isUploading = false;

                    if(angular.isDefined(nextItem)) {
                        nextItem.upload();
                        return;
                    }

                    this.onCompleteAll();
                    this.progress = this._getTotalProgress();
                    this._render();
                };
                /**********************
                 * STATIC
                 **********************/
                /**
                 * @borrows FileUploader.prototype.isFile
                 */
                FileUploader.isFile = FileUploader.prototype.isFile;
                /**
                 * @borrows FileUploader.prototype.isFileLikeObject
                 */
                FileUploader.isFileLikeObject = FileUploader.prototype.isFileLikeObject;
                /**
                 * @borrows FileUploader.prototype.isArrayLikeObject
                 */
                FileUploader.isArrayLikeObject = FileUploader.prototype.isArrayLikeObject;
                /**
                 * @borrows FileUploader.prototype.isHTML5
                 */
                FileUploader.isHTML5 = FileUploader.prototype.isHTML5;
                /**
                 * Inherits a target (Class_1) by a source (Class_2)
                 * @param {Function} target
                 * @param {Function} source
                 */
                FileUploader.inherit = function(target, source) {
                    target.prototype = Object.create(source.prototype);
                    target.prototype.constructor = target;
                    target.super_ = source;
                };
                FileUploader.FileLikeObject = FileLikeObject;
                FileUploader.FileItem = FileItem;
                FileUploader.FileDirective = FileDirective;
                FileUploader.FileSelect = FileSelect;
                FileUploader.FileDrop = FileDrop;
                FileUploader.FileOver = FileOver;

                // ---------------------------

                /**
                 * Creates an instance of FileLikeObject
                 * @param {File|HTMLInputElement|Object} fileOrInput
                 * @constructor
                 */
                function FileLikeObject(fileOrInput) {
                    var isInput = angular.isElement(fileOrInput);
                    var fakePathOrObject = isInput ? fileOrInput.value : fileOrInput;
                    var postfix = angular.isString(fakePathOrObject) ? 'FakePath' : 'Object';
                    var method = '_createFrom' + postfix;
                    this[method](fakePathOrObject);
                }

                /**
                 * Creates file like object from fake path string
                 * @param {String} path
                 * @private
                 */
                FileLikeObject.prototype._createFromFakePath = function(path) {
                    this.lastModifiedDate = null;
                    this.size = null;
                    this.type = 'like/' + path.slice(path.lastIndexOf('.') + 1).toLowerCase();
                    this.name = path.slice(path.lastIndexOf('/') + path.lastIndexOf('\\') + 2);
                };
                /**
                 * Creates file like object from object
                 * @param {File|FileLikeObject} object
                 * @private
                 */
                FileLikeObject.prototype._createFromObject = function(object) {
                    this.lastModifiedDate = angular.copy(object.lastModifiedDate);
                    this.size = object.size;
                    this.type = object.type;
                    this.name = object.name;
                };

                // ---------------------------

                /**
                 * Creates an instance of FileItem
                 * @param {FileUploader} uploader
                 * @param {File|HTMLInputElement|Object} some
                 * @param {Object} options
                 * @constructor
                 */
                function FileItem(uploader, some, options) {
                    var isInput = angular.isElement(some);
                    var input = isInput ? angular.element(some) : null;
                    var file = !isInput ? some : null;

                    angular.extend(this, {
                        url: uploader.url,
                        alias: uploader.alias,
                        headers: angular.copy(uploader.headers),
                        formData: angular.copy(uploader.formData),
                        removeAfterUpload: uploader.removeAfterUpload,
                        withCredentials: uploader.withCredentials,
                        method: uploader.method
                    }, options, {
                        uploader: uploader,
                        file: new FileUploader.FileLikeObject(some),
                        isReady: false,
                        isUploading: false,
                        isUploaded: false,
                        isSuccess: false,
                        isCancel: false,
                        isError: false,
                        progress: 0,
                        index: null,
                        _file: file,
                        _input: input
                    });

                    if (input) this._replaceNode(input);
                }
                /**********************
                 * PUBLIC
                 **********************/
                /**
                 * Uploads a FileItem
                 */
                FileItem.prototype.upload = function() {
                    this.uploader.uploadItem(this);
                };
                /**
                 * Cancels uploading of FileItem
                 */
                FileItem.prototype.cancel = function() {
                    this.uploader.cancelItem(this);
                };
                /**
                 * Removes a FileItem
                 */
                FileItem.prototype.remove = function() {
                    this.uploader.removeFromQueue(this);
                };
                /**
                 * Callback
                 * @private
                 */
                FileItem.prototype.onBeforeUpload = function() {};
                /**
                 * Callback
                 * @param {Number} progress
                 * @private
                 */
                FileItem.prototype.onProgress = function(progress) {};
                /**
                 * Callback
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 */
                FileItem.prototype.onSuccess = function(response, status, headers) {};
                /**
                 * Callback
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 */
                FileItem.prototype.onError = function(response, status, headers) {};
                /**
                 * Callback
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 */
                FileItem.prototype.onCancel = function(response, status, headers) {};
                /**
                 * Callback
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 */
                FileItem.prototype.onComplete = function(response, status, headers) {};
                /**********************
                 * PRIVATE
                 **********************/
                /**
                 * Inner callback
                 */
                FileItem.prototype._onBeforeUpload = function() {
                    this.isReady = true;
                    this.isUploading = true;
                    this.isUploaded = false;
                    this.isSuccess = false;
                    this.isCancel = false;
                    this.isError = false;
                    this.progress = 0;
                    this.onBeforeUpload();
                };
                /**
                 * Inner callback
                 * @param {Number} progress
                 * @private
                 */
                FileItem.prototype._onProgress = function(progress) {
                    this.progress = progress;
                    this.onProgress(progress);
                };
                /**
                 * Inner callback
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 * @private
                 */
                FileItem.prototype._onSuccess = function(response, status, headers) {
                    this.isReady = false;
                    this.isUploading = false;
                    this.isUploaded = true;
                    this.isSuccess = true;
                    this.isCancel = false;
                    this.isError = false;
                    this.progress = 100;
                    this.index = null;
                    this.onSuccess(response, status, headers);
                };
                /**
                 * Inner callback
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 * @private
                 */
                FileItem.prototype._onError = function(response, status, headers) {
                    this.isReady = false;
                    this.isUploading = false;
                    this.isUploaded = true;
                    this.isSuccess = false;
                    this.isCancel = false;
                    this.isError = true;
                    this.progress = 0;
                    this.index = null;
                    this.onError(response, status, headers);
                };
                /**
                 * Inner callback
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 * @private
                 */
                FileItem.prototype._onCancel = function(response, status, headers) {
                    this.isReady = false;
                    this.isUploading = false;
                    this.isUploaded = false;
                    this.isSuccess = false;
                    this.isCancel = true;
                    this.isError = false;
                    this.progress = 0;
                    this.index = null;
                    this.onCancel(response, status, headers);
                };
                /**
                 * Inner callback
                 * @param {*} response
                 * @param {Number} status
                 * @param {Object} headers
                 * @private
                 */
                FileItem.prototype._onComplete = function(response, status, headers) {
                    this.onComplete(response, status, headers);
                    if (this.removeAfterUpload) this.remove();
                };
                /**
                 * Destroys a FileItem
                 */
                FileItem.prototype._destroy = function() {
                    if (this._input) this._input.remove();
                    if (this._form) this._form.remove();
                    delete this._form;
                    delete this._input;
                };
                /**
                 * Prepares to uploading
                 * @private
                 */
                FileItem.prototype._prepareToUploading = function() {
                    this.index = this.index || ++this.uploader._nextIndex;
                    this.isReady = true;
                };
                /**
                 * Replaces input element on his clone
                 * @param {JQLite|jQuery} input
                 * @private
                 */
                FileItem.prototype._replaceNode = function(input) {
                    var clone = $compile(input.clone())(input.scope());
                    clone.prop('value', null); // FF fix
                    input.css('display', 'none');
                    input.after(clone); // remove jquery dependency
                };

                // ---------------------------

                /**
                 * Creates instance of {FileDirective} object
                 * @param {Object} options
                 * @param {Object} options.uploader
                 * @param {HTMLElement} options.element
                 * @param {Object} options.events
                 * @param {String} options.prop
                 * @constructor
                 */
                function FileDirective(options) {
                    angular.extend(this, options);
                    this.uploader._directives[this.prop].push(this);
                    this._saveLinks();
                    this.bind();
                }
                /**
                 * Map of events
                 * @type {Object}
                 */
                FileDirective.prototype.events = {};
                /**
                 * Binds events handles
                 */
                FileDirective.prototype.bind = function() {
                    for(var key in this.events) {
                        var prop = this.events[key];
                        this.element.bind(key, this[prop]);
                    }
                };
                /**
                 * Unbinds events handles
                 */
                FileDirective.prototype.unbind = function() {
                    for(var key in this.events) {
                        this.element.unbind(key, this.events[key]);
                    }
                };
                /**
                 * Destroys directive
                 */
                FileDirective.prototype.destroy = function() {
                    var index = this.uploader._directives[this.prop].indexOf(this);
                    this.uploader._directives[this.prop].splice(index, 1);
                    this.unbind();
                    // this.element = null;
                };
                /**
                 * Saves links to functions
                 * @private
                 */
                FileDirective.prototype._saveLinks = function() {
                    for(var key in this.events) {
                        var prop = this.events[key];
                        this[prop] = this[prop].bind(this);
                    }
                };

                // ---------------------------

                FileUploader.inherit(FileSelect, FileDirective);

                /**
                 * Creates instance of {FileSelect} object
                 * @param {Object} options
                 * @constructor
                 */
                function FileSelect(options) {
                    FileSelect.super_.apply(this, arguments);

                    if(!this.uploader.isHTML5) {
                        this.element.removeAttr('multiple');
                    }
                    this.element.prop('value', null); // FF fix
                }
                /**
                 * Map of events
                 * @type {Object}
                 */
                FileSelect.prototype.events = {
                    $destroy: 'destroy',
                    change: 'onChange'
                };
                /**
                 * Name of property inside uploader._directive object
                 * @type {String}
                 */
                FileSelect.prototype.prop = 'select';
                /**
                 * Returns options
                 * @return {Object|undefined}
                 */
                FileSelect.prototype.getOptions = function() {};
                /**
                 * Returns filters
                 * @return {Array<Function>|String|undefined}
                 */
                FileSelect.prototype.getFilters = function() {};
                /**
                 * If returns "true" then HTMLInputElement will be cleared
                 * @returns {Boolean}
                 */
                FileSelect.prototype.isEmptyAfterSelection = function() {
                    return !!this.element.attr('multiple');
                };
                /**
                 * Event handler
                 */
                FileSelect.prototype.onChange = function() {
                    var files = this.uploader.isHTML5 ? this.element[0].files : this.element[0];
                    var options = this.getOptions();
                    var filters = this.getFilters();

                    if (!this.uploader.isHTML5) this.destroy();
                    this.uploader.addToQueue(files, options, filters);
                    if (this.isEmptyAfterSelection()) this.element.prop('value', null);
                };

                // ---------------------------

                FileUploader.inherit(FileDrop, FileDirective);

                /**
                 * Creates instance of {FileDrop} object
                 * @param {Object} options
                 * @constructor
                 */
                function FileDrop(options) {
                    FileDrop.super_.apply(this, arguments);
                }
                /**
                 * Map of events
                 * @type {Object}
                 */
                FileDrop.prototype.events = {
                    $destroy: 'destroy',
                    drop: 'onDrop',
                    dragover: 'onDragOver',
                    dragleave: 'onDragLeave'
                };
                /**
                 * Name of property inside uploader._directive object
                 * @type {String}
                 */
                FileDrop.prototype.prop = 'drop';
                /**
                 * Returns options
                 * @return {Object|undefined}
                 */
                FileDrop.prototype.getOptions = function() {};
                /**
                 * Returns filters
                 * @return {Array<Function>|String|undefined}
                 */
                FileDrop.prototype.getFilters = function() {};
                /**
                 * Event handler
                 */
                FileDrop.prototype.onDrop = function(event) {
                    var transfer = this._getTransfer(event);
                    if (!transfer) return;
                    var options = this.getOptions();
                    var filters = this.getFilters();
                    this._preventAndStop(event);
                    angular.forEach(this.uploader._directives.over, this._removeOverClass, this);
                    this.uploader.addToQueue(transfer.files, options, filters);
                };
                /**
                 * Event handler
                 */
                FileDrop.prototype.onDragOver = function(event) {
                    var transfer = this._getTransfer(event);
                    if(!this._haveFiles(transfer.types)) return;
                    transfer.dropEffect = 'copy';
                    this._preventAndStop(event);
                    angular.forEach(this.uploader._directives.over, this._addOverClass, this);
                };
                /**
                 * Event handler
                 */
                FileDrop.prototype.onDragLeave = function(event) {
                    if (event.currentTarget !== this.element[0]) return;
                    this._preventAndStop(event);
                    angular.forEach(this.uploader._directives.over, this._removeOverClass, this);
                };
                /**
                 * Helper
                 */
                FileDrop.prototype._getTransfer = function(event) {
                    return event.dataTransfer ? event.dataTransfer : event.originalEvent.dataTransfer; // jQuery fix;
                };
                /**
                 * Helper
                 */
                FileDrop.prototype._preventAndStop = function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                };
                /**
                 * Returns "true" if types contains files
                 * @param {Object} types
                 */
                FileDrop.prototype._haveFiles = function(types) {
                    if (!types) return false;
                    if (types.indexOf) {
                        return types.indexOf('Files') !== -1;
                    } else if(types.contains) {
                        return types.contains('Files');
                    } else {
                        return false;
                    }
                };
                /**
                 * Callback
                 */
                FileDrop.prototype._addOverClass = function(item) {
                    item.addOverClass();
                };
                /**
                 * Callback
                 */
                FileDrop.prototype._removeOverClass = function(item) {
                    item.removeOverClass();
                };

                // ---------------------------

                FileUploader.inherit(FileOver, FileDirective);

                /**
                 * Creates instance of {FileDrop} object
                 * @param {Object} options
                 * @constructor
                 */
                function FileOver(options) {
                    FileOver.super_.apply(this, arguments);
                }
                /**
                 * Map of events
                 * @type {Object}
                 */
                FileOver.prototype.events = {
                    $destroy: 'destroy'
                };
                /**
                 * Name of property inside uploader._directive object
                 * @type {String}
                 */
                FileOver.prototype.prop = 'over';
                /**
                 * Over class
                 * @type {string}
                 */
                FileOver.prototype.overClass = 'nv-file-over';
                /**
                 * Adds over class
                 */
                FileOver.prototype.addOverClass = function() {
                    this.element.addClass(this.getOverClass());
                };
                /**
                 * Removes over class
                 */
                FileOver.prototype.removeOverClass = function() {
                    this.element.removeClass(this.getOverClass());
                };
                /**
                 * Returns over class
                 * @returns {String}
                 */
                FileOver.prototype.getOverClass = function() {
                    return this.overClass;
                };

                return FileUploader;
            }])


        .directive('nvFileSelect', ['$parse', 'FileUploader', function($parse, FileUploader) {
            return {
                link: function(scope, element, attributes) {
                    var uploader = scope.$eval(attributes.uploader);

                    if (!(uploader instanceof FileUploader)) {
                        throw new TypeError('"Uploader" must be an instance of FileUploader');
                    }

                    var object = new FileUploader.FileSelect({
                        uploader: uploader,
                        element: element
                    });

                    object.getOptions = $parse(attributes.options).bind(object, scope);
                    object.getFilters = function() {return attributes.filters;};
                }
            };
        }])


        .directive('nvFileDrop', ['$parse', 'FileUploader', function($parse, FileUploader) {
            return {
                link: function(scope, element, attributes) {
                    var uploader = scope.$eval(attributes.uploader);

                    if (!(uploader instanceof FileUploader)) {
                        throw new TypeError('"Uploader" must be an instance of FileUploader');
                    }

                    if (!uploader.isHTML5) return;

                    var object = new FileUploader.FileDrop({
                        uploader: uploader,
                        element: element
                    });

                    object.getOptions = $parse(attributes.options).bind(object, scope);
                    object.getFilters = function() {return attributes.filters;};
                }
            };
        }])


        .directive('nvFileOver', ['FileUploader', function(FileUploader) {
            return {
                link: function(scope, element, attributes) {
                    var uploader = scope.$eval(attributes.uploader);

                    if (!(uploader instanceof FileUploader)) {
                        throw new TypeError('"Uploader" must be an instance of FileUploader');
                    }

                    var object = new FileUploader.FileOver({
                        uploader: uploader,
                        element: element
                    });

                    object.getOverClass = function() {
                        return attributes.overClass || this.overClass;
                    };
                }
            };
        }])

        /*
        * Additional directive not included in original library for displayin thumbnails of images
        */
        .directive('ngThumb', ['$window', function($window) {
            var helper = {
                support: !!($window.FileReader && $window.CanvasRenderingContext2D),
                isFile: function(item) {
                    return angular.isObject(item) && item instanceof $window.File;
                },
                isImage: function(file) {
                    var type =  '|' + file.type.slice(file.type.lastIndexOf('/') + 1) + '|';
                    return '|jpg|png|jpeg|bmp|gif|'.indexOf(type) !== -1;
                }
            };

            return {
                restrict: 'A',
                template: '<canvas/>',
                link: function(scope, element, attributes) {
                    if (!helper.support) return;

                    var params = scope.$eval(attributes.ngThumb);

                    if (!helper.isFile(params.file)) return;
                    if (!helper.isImage(params.file)) return;

                    var canvas = element.find('canvas');
                    var reader = new FileReader();

                    reader.onload = onLoadFile;
                    reader.readAsDataURL(params.file);

                    function onLoadFile(event) {
                        var img = new Image();
                        img.onload = onLoadImage;
                        img.src = event.target.result;
                    }

                    function onLoadImage() {
                        var width = params.width || this.width / this.height * params.height;
                        var height = params.height || this.height / this.width * params.width;
                        canvas.attr({ width: width, height: height });
                        canvas[0].getContext('2d').drawImage(this, 0, 0, width, height);
                    }
                }
            };
        }]);

    return module;
}));
