(function () {
    const emmet = require('./sdk/emmet');
    const snips = require('./extra/snippets');
    const log = require('ko/logging').getLogger('xemmet');    
    const sublangs = {
        html: ["html", "html5", "rhtml", "erb", "html.erb", "erb.html"],
        css: ["css", "scss", "less"]
    };
    
    var loaded = false;
    
    this.debug = {};
    this.prefs = {};
    
    this.getProperty = (property) => this[property];
    
    this.getEmmet = () => emmet;
    this.getLogger = () => log;
    this.getSnippets = () => snips;
    this.getSubLanguages = () => sublangs;
    
    
    this.load = (silent) => {
        window.addEventListener('keydown', this.onKeyDownListener, true);
        log.setLevel(require('ko/logging').LOG_DEBUG);
        loaded = true;
        if (typeof(silent) != "undefined" && silent) return;
        log.info("Xemmet loaded");
    };
    
    this.unload = (silent) => {
        window.removeEventListener('keydown', this.onKeyDownListener, true);
        loaded = false;
        if (typeof(silent) != "undefined" && silent) return;
        log.info("Xemmet unloaded");
    };
    
    this.disable = () => {
        if (!loaded) return false;
        this.unload(true);
        log.info("Xemmet disabled");
        loaded = false;
        return true;
    };
    
    this.enable = () => {
        if (loaded) return false;
        this.load(true);
        log.info("Xemmet enabled");
        loaded = false;
        return true;
    };

    (function (ext) {
        var logging = require('ko/logging');
        
        var getConst = (_const) => {
            return ext[`get${_const}`]();
        };
        
        const logLevels = {
            debug: logging.LOG_DEBUG,
            info: logging.LOG_INFO,
            warn: log.LOG_WARN,
            error: log.LOG_ERROR,
            critical: log.LOG_CRITICAL
        };
        
        this.setLogLevel = (level) => {
            getConst("Logger").setLevel(logLevels[level]);
        };
        
        this.get = (_property) => {
            var property = ext.getProperty(_property);
            if (typeof(property) == "undefined") property = getConst(_property);
            return property;
        };
    }).apply(this.debug, [this]);
    
    (function() {
        var p = require('ko/prefs');
        
        this.setBool = (name, value) => p.setBoolean(name, value);
        this.setString = (name, value) => p.setString(name, value);
        this.setLong = (name, value) => p.setLong(name, value);
        
        this.getBool = (name, value) => p.getBoolean(name, value);
        this.getString = (name, value) => p.getString(name, value);
        this.getLong = (name, value) => p.getLong(name, value);
    }).apply(this.prefs);
    
    this._createSnippet = (text, noIndent) => {
        return {
            type: 'snippet',
            name: 'xemmet-snippet',
            parent: {name: 'xemmet-parent'},
            set_selection: false,
            indent_relative: !noIndent,
            value: text,
            hasAttribute: function(name) { return (name in this); },
            getStringAttribute: function(name) { return ('' + this[name]); }
        };
    };
    
    this._replaceWithTabstops = (text, search, block) => {
        var prepared = text.replace(search, block);
        return prepared;
    };
    
    this._prepareTabstops = (snippet, lang) => {
        var i = 0;
        var nowrap = false;
        if (lang == "css") nowrap = true;
        log.debug(`Language: ${lang}, Snippet: ${snippet}`);
        var prepared = this._replaceWithTabstops(snippet,
                                                 /\|/gmi,
                                                 () => {
                                                    return "[[%tabstop:]]";
                                                 });
        prepared = this._replaceWithTabstops(prepared,
                                             /(\$\{(\d+|\w+)(?:\:(.+?))?\})/gmi,
                                             (_, g1, g2, g3) => {
                                                if (isNaN(g2)) {
                                                    g3 = g2;
                                                    g2 = "";
                                                }
                                                if (typeof(g3) == "undefined") g3 = "";
                                                return `[[%tabstop${g2}:${g3}]]`;
                                             });
        prepared = this._replaceWithTabstops(prepared,
                                             /\{\s*\}/gmi,
                                             () => {
                                                i++;
                                                return `{[[%tabstop${i}:]]}`;
                                             });
        log.debug(`To insert: ${prepared}`);
        return prepared;
    };
    
    this._getRootLanguage = (language) => {
        if (sublangs.html.indexOf(language) > -1) return "html";
        if (sublangs.css.indexOf(language) > -1) return "css";        
    };
    
    this._getSnippet = (language, text) => {
        var _return = snips.getSnippet(language, text);
        if (!_return) {
            return [false, text];
        }
        return [true, _return];
    };
    
    this._expandAbbreviation = (string, lang) => {
        try {
            return emmet.expandAbbreviation(string, lang);
        } catch (e) {
            return string;
        }
    };
    
    this._isEmmetAbbreviation = (expandable, lang) => {
        if (this.prefs.getBool("xemmet_snippets_are_important", false) === true &&
            ko.abbrev._checkPossibleAbbreviation(expandable)) {
            log.debug(`There's a snippet for ${expandable}, canceling Xemmet handle..`);
            return [false, ""];
        }
        try {
            var abbr, toExpand;
            var snippet = this._getSnippet(lang, expandable);
            if (snippet[0] === false) {
                toExpand = `abbreviation: ${expandable}`;
                abbr = emmet.expandAbbreviation(snippet[1], lang);
            } else {
                toExpand = `snippet "${expandable}": ${snippet[1]}`;
                abbr = emmet.expandAbbreviation(snippet[1], lang);
            }
            if (abbr.trim().length === 0) {
                log.debug(`Emmet abbreviation is empty (invalid), got ${toExpand}`);
                return [false, ""];
            }
            return [true, abbr];
        } catch (e) {
            if (snippet === false) {
                log.debug(`Emmet abbreviation is invalid, tried to expand ${toExpand}`);
                return [false, ""];
            } else {
                log.debug(`Emmet failed to expand snippet, Xemmet hopes it's valid: ${toExpand}`);
                return [true, snippet[1]];
            }
        }
    };
    
    this._finalize = () => {
        log.info("Current string is not a valid Emmet abbreviation, pass it to Komodo handlers");
        return true;
    };
    
    this.onKeyDownListener = (e) => {
        var editor = require('ko/editor');
        var views = require('ko/views');
        var lang = this._getRootLanguage(views.current().get('language').toLowerCase());
        if (e.keyCode === 9) { // tab key
            log.debug('Processing tab press...');
            
            var toExpand = editor.getLine().replace(/\t|\s{2,}/gm, "");
            
            log.debug(`Abbreviation before caret: ${toExpand}`);
            var abbreviation = this._isEmmetAbbreviation(toExpand, lang);
            if (abbreviation[0]) {
                e.preventDefault();
                var toInsert = this._prepareTabstops(abbreviation[1], lang);
                var expand = this._expandAbbreviation(toInsert, lang);
                var posStart = editor.getCursorPosition();
                posStart.ch -= toExpand.length;
                var posEnd = editor.getCursorPosition();
                
                editor.setSelection(
                    posStart,
                    posEnd
                );
                
                editor.replaceSelection(""); // remove abbreviation
                var tempSnippet = this._createSnippet(expand, false);
                
                ko.abbrev.insertAbbrevSnippet(tempSnippet,
                                              require('ko/views').current().get());
            } else {
                return this._finalize();
            }
        }
    };
}).apply(module.exports);