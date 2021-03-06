(->
  log      = require('ko/logging').getLogger 'xemmet'
  {Cc, Ci} = require 'chrome'

  injectObserver = no
  injections = []

  prefWindowObserver =
    observe: (subject, topic, data) ->
      for o in injections
        log.debug JSON.stringify o

        basename        = o.basename
        siblingSelector = o.siblingSelector
        caption         = o.caption

        if data.indexOf(basename) is -1
          continue

        wm = Cc['@mozilla.org/appshell/window-mediator;1'].getService Ci.nsIWindowMediator
        windows = wm.getEnumerator 'komodo_prefs'
        contentWindow = windows.getNext().QueryInterface Ci.nsIDOMWindow

        unless contentWindow
          log.debug 'Cannot find pref window, skipping injection'
          continue

        frameWindow = no

        for x in contentWindow.frames
          if x.location.href.indexOf(basename) isnt -1
            frameWindow = x
            break

        unless frameWindow
          log.debug 'Cannot find frame window, skipping injection'
          continue

        $ = require 'ko/dom'

        if $('#xemmet_main', frameWindow.document).length > 0
          log.debug 'The pref is already injected in current DOM, skipping'
          continue

        sibling = $ siblingSelector, frameWindow.document
        options = $.create 'groupbox', {id: 'xemmet_main'},
        $.create('caption', {label: caption})('vbox', {flex: 1, id: 'xemmet_main_vbox'})
        sibling.after options.toString()

        xemmet = require 'xemmet/xemmet'
        xemmetEnabled = require('ko/ui/checkbox').create 'Enable Xemmet'
        wrapStrictMode = require('ko/ui/checkbox').create 'Wrap selection only works for HTML based languages'
        wrapLineMode = require('ko/ui/checkbox').create 'Wrap selection uses current line if there is no selection'
        beautifyExpand = require('ko/ui/checkbox').create 'Beautify expanded abbreviation'
        strictMode = require('ko/ui/checkbox').create 'Xemmet only works for HTML and CSS based languages'

        prefs = [
          ['xemmet.enabled', yes]
          ['xemmet.strict.wrap', yes]
          ['xemmet.wrap_lines', yes]
          ['xemmet.beautify', yes]
          ['xemmet.strict', yes]
        ]

        target = $ '#xemmet_main_vbox', frameWindow.document

        for pref, index in [xemmetEnabled, wrapStrictMode, wrapLineMode, beautifyExpand, strictMode]
          pref.checked xemmet.prefs.getBoolean prefs[index][0], prefs[index][1]
          pref.$element.attr 'id', prefs[index][0]
          pref.$element.attr 'pref', yes
          pref.$element.attr 'preftype', 'boolean'
          target.append pref.$element

        textboxes = $.create('hbox', {id: 'xemmet_textbox_hbox', flex: 1},
          $.create('textbox', {
            id: 'xemmet_html_langs'
            flex: 1
            multiline: yes
            rows: 3
            pref: yes
            prefstring: 'xemmet.languages.html'
            prefattribute: 'value'
            placeholder: 'Additional HTML Language Names that Xemmet should run on'
          })('textbox', {
            id: 'xemmet_css_langs'
            flex: 1
            multiline: yes
            rows: 3
            pref: yes
            prefstring: 'xemmet.languages.css'
            prefattribute: 'value'
            placeholder: 'Additional CSS Language Names that Xemmet should run on'
          })
        )
        
        target.append textboxes.toString()
        
        log.debug 'created the injection'

  @injectPref = (o) ->
    log.debug 'injecting a preference'
    log.debug JSON.stringify o
    try
      injections.push o
    catch e
      log.debug 'something went wrong'
      log.exception e

    unless injectObserver
      injectObserver = yes

      observerSvc = Cc['@mozilla.org/observer-service;1'].getService Ci.nsIObserverService
      observerSvc.addObserver prefWindowObserver, 'pref_page_loaded', no
).apply module.exports
