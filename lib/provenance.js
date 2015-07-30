'use strict'

module.exports = provenance

var fsRoot = require('fs-find-root')
var estoc  = require('estoc')
var path   = require('path')

function provenance (file, pos, ready) {
  // pos: {line, col}
  var calledBy = new Map()
  var called = new Map()
  var iocCalledBy = new Map()
  var iocCalled = new Map()
  var definedBy = new Map()
  var fns = new Set()
  var targets = []
  var targetFile = null

  fsRoot.file('package.json', path.dirname(file), onroot)

  function onroot (err, root) {
    if (err) {
      return ready(err)
    }

    root = path.dirname(root)
    targetFile = '/' + path.relative(root, file).split(path.sep).join('/')
  
    estoc(root, oncomplete)
      .on('ioc-callfn', onioc)
      .on('defn', onfunction)
      .on('callfn', oncall)
      .on('data', ondata)
  }

  function oncomplete (err) {
    if (err) {
      return ready(err)
    }

    var target = targets.sort(function(lhs, rhs) {
      return lhs.loc.start.line - pos.line > rhs.loc.start.line - pos.line ? -1 :
             lhs.loc.start.line - pos.line < rhs.loc.start.line - pos.line ? 1 :
             lhs.loc.start.col - pos.col > rhs.loc.start.col - pos.col ? -1 :
             lhs.loc.start.col - pos.col < rhs.loc.start.col - pos.col ? 1 :
             0
    })[0]

    var rels = [
      [calledBy, 'called-by', new Set],
      [iocCalledBy, 'ioc-by', new Set],
      [definedBy, 'defined-by', new Set]
    ]

    var idMap = new Map
    var id = 0
    var styles = {
      'called-by': 'color="black"',
      'ioc-by': 'color="grey" style="dashed" label="ioc"',
      'defined-by': 'color="lightgrey" style="dotted" label="defs"'
    }
    var output = []
    visit(target, output)

    for (
      var iter = idMap.keys(), xs = iter.next();
      !xs.done; xs = iter.next()) {
      var idNumber = idMap.get(xs.value)
      output.unshift(
        'A' + idNumber + ' [label=' + JSON.stringify(xs.value._name) +
        (target === xs.value ? ' fillcolor="lightgreen"' : '') +
        ']'
      )
    }

    console.log('digraph { %s; }', output.join(';\n'))

    function visit (last) {
      rels.forEach(function (tuple) {
        var map = tuple[0]
        var type = tuple[1]
        var seen = tuple[2]
        var next = map.get(last)
        if (!next) {
          return
        }
        for (
          var iter = next.values(), xs = iter.next();
          !xs.done; xs = iter.next()) {
          if (seen.has(xs.value)) {
            continue
          }
          seen.add(xs.value)
          if (!idMap.has(xs.value)) {
            idMap.set(xs.value, id++)
          }
          if (!idMap.has(last)) {
            idMap.set(last, id++)
          }

          output.push(
            'A' + idMap.get(xs.value) + ' -> A' + idMap.get(last) +
            ' [' + styles[type] + ']'
            
          )

          visit(xs.value, output)
        }
      })
    }
  }

  function onfunction (fn, parent) {
    if (parent) {
      fn._code._name = fn._name
      parent._code._name = parent._name
      if (!definedBy.has(fn._code)) {
        definedBy.set(fn._code, new Set())
      }
      definedBy.get(fn._code).add(parent._code)
    }
  }

  // XXX: "we're calling some other lib"
  function ondata (usage) {
    if (usage._type !== usage.constructor.CALL) {
      return
    }
  }

  function onioc (from, to) {
    var lhs = from._code || from
    var rhs = to._code || to

    var toMarks = to.getMark('tracked-name').filter(Boolean)
    if (toMarks[0]) {
      rhs._name = toMarks[0].join('.')
    } else {
      rhs._name = to._name
    }

    var fromMarks = from.getMark('tracked-name').filter(Boolean)
    if (fromMarks[0]) {
      lhs._name = fromMarks[0].join('.')
    } else {
      lhs._name = from._name
    }

    checkSFITarget(from.filename, lhs)
    checkSFITarget(to.filename, rhs)
    if (!iocCalled.has(lhs)) {
      iocCalled.set(lhs, new Set())
    }
    if (!iocCalledBy.has(rhs)) {
      iocCalledBy.set(rhs, new Set())
    }
    iocCalled.get(lhs).add(rhs)
    iocCalledBy.get(rhs).add(lhs)
  }

  function oncall (from, to) {
    var lhs = from._code || from
    var rhs = to._code || to

    var toMarks = to.getMark('tracked-name').filter(Boolean)
    if (toMarks[0]) {
      rhs._name = toMarks[0].join('.')
    } else {
      rhs._name = to._name
    }

    var fromMarks = from.getMark('tracked-name').filter(Boolean)
    if (fromMarks[0]) {
      lhs._name = fromMarks[0].join('.')
    } else {
      lhs._name = from._name
    }

    checkSFITarget(from.filename, lhs)
    checkSFITarget(to.filename, rhs)
    if (!called.has(lhs)) {
      called.set(lhs, new Set())
    }
    if (!calledBy.has(rhs)) {
      calledBy.set(rhs, new Set())
    }
    called.get(lhs).add(rhs)
    calledBy.get(rhs).add(lhs)
  }

  function checkSFITarget (filename, ast) {
    if (!filename || !ast || !ast.loc || !ast.loc.start || !ast.loc.end) {
      return
    }

    if ((targetFile !== filename) ||
        (ast.loc.start.line > pos.line) ||
        (ast.loc.start.line === pos.line && ast.loc.start.column > pos.column) ||
        (ast.loc.end.line < pos.line) ||
        (ast.loc.end.line === pos.line && ast.loc.end.column < pos.column)) {
      return
    }

    targets.push(ast)
  }
}
