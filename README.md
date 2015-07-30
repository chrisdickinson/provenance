# provenance

A CLI script that takes a position in a JS file inside an npm package, and
outputs a directed graph of all of the functions that call the function at that
position.

![demo](http://i.imgur.com/wyF4TeA.gifv)

## installation, or:
## vim + graphviz + quicklook

My provenance setup requires:

* iojs v2.x
* graphviz (via homebrew)

I wrote this so I could mash `<Leader>sx` and get a quick heads up display of
what calls the function I'm looking at. To that end, I wrote a script to store
stdin as a tempfile and use `qlmanage` to quickly display it:

```bash
#!/bin/bash
# call this file "ql" and `chmod +x` it
tmpfile=$(mktemp -t ql)
mv "$tmpfile"{,.png}
tmpfile=${tmpfile}.png
cat > "$tmpfile"
qlmanage -p $tmpfile >& /dev/null
rm $tmpfile
```

With that file on `$PATH` as `ql`, I added the following info to my `.vimrc`:

```vim
" ~/.vimrc
nmap <leader>sx :exe "!iojs /path/to/provenance/bin/provenance % " . line(".") . " " . col(".") . "\| dot -Tpng \| ql" <CR>
```

## notes

Provenance trys to note all calling paths into your current function.

* It attempts to note "inversion of control" (or `ioc`) calls, though it sometimes
  misses.
* It will definitely miss call that is a result of a dynamic lookup: `obj[something]()`.
* It needs a valid `package.json` at the root of your project to build a list
  of files to look at. If your file is not indirectly required by the `"main"`
  script of your package.json, it may not produce useful output.
* It will also note "defs" relations — as in, "this function is defined by
  another function."
* It only notes any given function once at most — there may be many paths through
  a function to your current function, but it will only appear once.

## license

MIT
