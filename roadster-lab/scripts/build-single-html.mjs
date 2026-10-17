import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const scriptPath = fileURLToPath(import.meta.url);
const dist = path.resolve(path.dirname(scriptPath), '../dist');
const identifier = /^[A-Za-z_$][\w$]*$/;
const fail = message => { throw new Error(`Single HTML build: ${message}`); };

// A small lexer, not a JavaScript parser. Strings, comments, regex literals and
// template raw text must never be mistaken for module syntax or delimiters.
function tokenize(source, label) {
  let pos = 0;
  const error = message => fail(`${label}:${source.slice(0, pos).split('\n').length}: ${message}`);
  function scan(templateExpression = false) {
    const tokens = [], stack = [];
    let expression = true;
    const push = (type, start, value = source.slice(start, pos)) => {
      const token = {type, value, start, end: pos, depth: stack.length};
      tokens.push(token);
      return token;
    };
    while (pos < source.length) {
      const c = source[pos], next = source[pos + 1];
      if (/\s/.test(c)) { pos++; continue; }
      if (c === '/' && next === '/') {
        pos += 2;
        while (pos < source.length && !/[\r\n]/.test(source[pos])) pos++;
        continue;
      }
      if (c === '/' && next === '*') {
        const end = source.indexOf('*/', pos + 2);
        if (end < 0) error('unterminated comment');
        pos = end + 2;
        continue;
      }
      const start = pos;
      if (c === '"' || c === "'") {
        pos++;
        while (pos < source.length && source[pos] !== c) {
          if (/[\r\n]/.test(source[pos])) error('newline in string');
          if (source[pos] === '\\') pos++;
          pos++;
        }
        if (pos >= source.length) error('unterminated string');
        pos++;
        push('string', start);
        expression = false;
        continue;
      }
      if (c === '`') {
        pos++;
        let closed = false;
        while (pos < source.length) {
          if (source[pos] === '\\') { pos += 2; continue; }
          if (source[pos] === '`') { pos++; closed = true; break; }
          if (source[pos] === '$' && source[pos + 1] === '{') {
            pos += 2;
            const inner = scan(true);
            if (inner.some((t, i) => ['import', 'export'].includes(t.value) && !['.', '?.'].includes(inner[i - 1]?.value))) {
              error('module syntax inside template expression is unsupported');
            }
          } else pos++;
        }
        if (!closed) error('unterminated template');
        push('template', start);
        expression = false;
        continue;
      }
      if (c === '/' && expression && next !== '=') {
        pos++;
        let characterClass = false, closed = false;
        while (pos < source.length) {
          const r = source[pos++];
          if (r === '\\') { pos++; continue; }
          if (/[\r\n]/.test(r)) error('newline in regex');
          if (r === '[') characterClass = true;
          if (r === ']') characterClass = false;
          if (r === '/' && !characterClass) { closed = true; break; }
        }
        if (!closed) error('unterminated regex');
        while (/[a-z]/i.test(source[pos] || '') && pos < source.length) pos++;
        push('regex', start);
        expression = false;
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        pos++;
        while (pos < source.length && /[\w$]/.test(source[pos])) pos++;
        const token = push('identifier', start);
        expression = /^(return|throw|case|delete|void|typeof|new|in|of|yield|await|else|do|instanceof)$/.test(token.value);
        continue;
      }
      if (/[0-9]/.test(c)) {
        pos++;
        while (pos < source.length && /[\w.]/.test(source[pos])) pos++;
        push('number', start);
        expression = false;
        continue;
      }
      if (c === '}' && !stack.length && templateExpression) { pos++; return tokens; }
      const operator = ['===', '!==', '>>>', '**=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '**', '<<', '>>', '...'].find(op => source.startsWith(op, pos));
      pos += operator?.length || 1;
      const token = push('punctuation', start);
      if ('([{'.includes(token.value)) {
        // Control-condition closing parens can be followed by a regex statement.
        token.control = token.value === '(' && /^(if|while|for|with|switch|catch)$/.test(tokens.at(-2)?.value || '');
        stack.push(tokens.length - 1);
        expression = true;
      } else if (')]}'.includes(token.value)) {
        const opening = stack.pop();
        if (opening === undefined || '([{'.indexOf(tokens[opening].value) !== ')]}'.indexOf(token.value)) error('unbalanced delimiter');
        tokens[opening].match = tokens.length - 1;
        token.depth = stack.length;
        expression = token.value === ')' && tokens[opening].control;
      } else expression = !['.', '?.', '++', '--'].includes(token.value);
    }
    if (stack.length || templateExpression) error('unclosed delimiter');
    return tokens;
  }
  return scan();
}

function parseModule(source, label) {
  const tokens = tokenize(source, label), imports = [], exports = new Map(), edits = [];
  let importEnd = 0;
  const error = message => fail(`${label}: ${message}`);
  const isID = token => token?.type === 'identifier' && identifier.test(token.value);
  const addExport = (name, local) => {
    if (exports.has(name)) error(`duplicate export ${name}`);
    exports.set(name, local);
  };
  const leading = token => /^[\t ]*$/.test(source.slice(source.lastIndexOf('\n', token.start - 1) + 1, token.start));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'identifier' || !['import', 'export'].includes(token.value) || ['.', '?.'].includes(tokens[i - 1]?.value)) continue;
    if (token.depth !== 0 || !leading(token)) error(`unsupported ${token.value} (expected leading top-level declaration)`);
    if (token.value === 'import') {
      if (i !== importEnd) error('imports must precede module code');
      let j = i + 1;
      const bindings = [];
      if (tokens[j]?.value === '*') {
        if (tokens[++j]?.value !== 'as' || !isID(tokens[++j])) error('invalid namespace import');
        bindings.push({local: tokens[j++].value, imported: '*'});
      } else if (tokens[j]?.value === '{') {
        j++;
        while (tokens[j]?.value !== '}') {
          if (!isID(tokens[j])) error('only named and namespace imports are supported');
          const imported = tokens[j++].value;
          let local = imported;
          if (tokens[j]?.value === 'as') {
            if (!isID(tokens[++j])) error('invalid import alias');
            local = tokens[j++].value;
          }
          bindings.push({imported, local});
          if (tokens[j]?.value !== ',') break;
          j++;
        }
        if (tokens[j++]?.value !== '}') error('invalid named imports');
      } else error('only named and namespace imports are supported');
      if (tokens[j++]?.value !== 'from' || tokens[j]?.type !== 'string') error('missing import specifier');
      const raw = tokens[j++].value;
      if (raw.includes('\\')) error('escaped import specifiers are unsupported');
      const specifier = raw.slice(1, -1);
      if (tokens[j]?.value !== ';') error('imports must end with a semicolon');
      imports.push({specifier, bindings});
      edits.push({start: token.start, end: tokens[j].end, text: ''});
      importEnd = j + 1;
      i = j;
    } else {
      const kind = tokens[i + 1]?.value;
      if (kind === '{') {
        let j = i + 2;
        while (tokens[j]?.value !== '}') {
          if (!isID(tokens[j])) error('invalid export list');
          const local = tokens[j++].value;
          let name = local;
          if (tokens[j]?.value === 'as') {
            if (!isID(tokens[++j])) error('invalid export alias');
            name = tokens[j++].value;
          }
          addExport(name, local);
          if (tokens[j]?.value !== ',') break;
          j++;
        }
        if (tokens[j++]?.value !== '}' || tokens[j]?.value !== ';') error('re-exports and unterminated export lists are unsupported');
        edits.push({start: token.start, end: tokens[j].end, text: ''});
        i = j;
      } else if (kind === 'const') {
        let j = i + 2;
        // Skip whole nested expressions so commas in objects, calls, arrays and
        // arrow-function bodies are not confused with variable declarations.
        while (true) {
          if (!isID(tokens[j]) || tokens[j + 1]?.value !== '=') error('exported const requires a simple initialized binding');
          addExport(tokens[j].value, tokens[j].value);
          j += 2;
          while (j < tokens.length && ![';', ','].includes(tokens[j].value)) {
            j = tokens[j].match === undefined ? j + 1 : tokens[j].match + 1;
          }
          if (!tokens[j]) error('exported const must end with a semicolon');
          if (tokens[j].value === ';') break;
          j++;
        }
        edits.push({start: token.start, end: tokens[i + 1].start, text: ''});
        // Still inspect initializers for unsupported dynamic imports.
      } else if (kind === 'function' || kind === 'class') {
        if (!isID(tokens[i + 2])) error('anonymous/generator exports are unsupported');
        addExport(tokens[i + 2].value, tokens[i + 2].value);
        edits.push({start: token.start, end: tokens[i + 1].start, text: ''});
      } else error(`unsupported export ${kind}`);
    }
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return {source, imports, exports};
}

function insideDist(filename) {
  const relative = path.relative(dist, filename);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

async function localFile(specifier, importer, extension, bareThree = false) {
  if (bareThree && specifier === 'three') specifier = './vendor/three.module.js', importer = path.join(dist, 'index.html');
  if (!/^(\.\/|\.\.\/)/.test(specifier) || /[\\?#%\0]/.test(specifier)) fail(`unsupported local specifier ${JSON.stringify(specifier)} in ${path.relative(dist, importer)}`);
  const filename = path.resolve(path.dirname(importer), specifier);
  if (!insideDist(filename) || path.extname(filename) !== extension) fail(`specifier must stay inside dist and reference ${extension}: ${specifier}`);
  let real;
  try { real = await fs.realpath(filename); }
  catch (error) { fail(`cannot resolve ${specifier} from ${path.relative(dist, importer)}: ${error.message}`); }
  if (!insideDist(real)) fail(`symlink escapes dist: ${specifier}`);
  return real;
}

// Resolve existing symlinks even when the final file (or parents) does not
// exist yet. Protection must describe the destination writeFile would reach.
async function canonicalDestination(filename) {
  try { return await fs.realpath(filename); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // A dangling final symlink is not a safe output target either.
    try { if ((await fs.lstat(filename)).isSymbolicLink()) fail('output is a dangling symlink'); }
    catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
    const parent = path.dirname(filename);
    if (parent === filename) throw error;
    return path.join(await canonicalDestination(parent), path.basename(filename));
  }
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
}

/** Build the simulator only; no asset viewer, runtime loader, eval or npm tools. */
export async function buildSingleHTML({output = path.join(dist, 'roadster-rocket-standalone.html')} = {}) {
  output = path.resolve(output);
  const index = path.join(dist, 'index.html');
  let html = await fs.readFile(index, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)];
  const modules = scripts.filter(([tag]) => attribute(tag, 'type') === 'module');
  const maps = scripts.filter(([tag]) => attribute(tag, 'type') === 'importmap');
  const styles = [...html.matchAll(/<link\b[^>]*>/gi)].filter(([tag]) => attribute(tag, 'rel') === 'stylesheet');
  if (modules.length !== 1 || maps.length > 1 || scripts.length !== modules.length + maps.length || styles.length !== 1) fail('expected one module script, one stylesheet and at most one import map');
  if (maps.length) {
    const map = JSON.parse(maps[0][0].replace(/^<script\b[^>]*>/i, '').replace(/<\/script\s*>$/i, ''));
    if (JSON.stringify(map) !== JSON.stringify({imports: {three: './vendor/three.module.js'}})) fail('unsupported import map');
    html = html.replace(maps[0][0], '');
  }
  const entrySrc = attribute(modules[0][0], 'src');
  const cssSrc = attribute(styles[0][0], 'href');
  if (!entrySrc || !cssSrc) fail('entry script and stylesheet must have local paths');
  const htmlSpecifier = value => value.startsWith('.') ? value : `./${value}`;
  const entry = await localFile(htmlSpecifier(entrySrc), index, '.js');
  const cssPath = await localFile(htmlSpecifier(cssSrc), index, '.css');
  const css = await fs.readFile(cssPath, 'utf8');
  if (/<\/style/i.test(css) || /@import\b|url\s*\(/i.test(css)) fail('CSS closing style tags and external resources are unsupported');
  html = html.replace(styles[0][0], () => `<style>\n${css}\n</style>`);

  const graph = new Map(), ordered = [], visiting = new Set();
  async function visit(filename, chain = []) {
    if (visiting.has(filename)) fail(`module cycle: ${[...chain, filename].map(file => path.relative(dist, file)).join(' -> ')}`);
    if (graph.has(filename)) return graph.get(filename);
    visiting.add(filename);
    const label = path.relative(dist, filename).split(path.sep).join('/');
    const module = {...parseModule(await fs.readFile(filename, 'utf8'), label), filename, label};
    module.dependencies = [];
    for (const declaration of module.imports) {
      const target = await localFile(declaration.specifier, filename, '.js', maps.length === 1);
      const dependency = await visit(target, [...chain, filename]);
      for (const binding of declaration.bindings) {
        if (binding.imported !== '*' && !dependency.exports.has(binding.imported)) fail(`${label}: missing export ${binding.imported} in ${dependency.label}`);
      }
      module.dependencies.push(dependency);
    }
    module.id = ordered.length;
    visiting.delete(filename);
    graph.set(filename, module);
    ordered.push(module);
    return module;
  }
  await visit(entry);
  const factories = ordered.map(module => {
    const bindings = module.imports.flatMap((declaration, i) => declaration.bindings.map(binding =>
      `const ${binding.local} = __deps[${i}]${binding.imported === '*' ? '' : `[${JSON.stringify(binding.imported)}]`};`)).join('\n');
    // Namespace getters retain aliases and avoid copying Three's export values.
    const exports = [...module.exports].map(([name, local]) => `get [${JSON.stringify(name)}]() { return ${local}; }`).join(',\n');
    let source = module.source;
    if (module.filename === entry) {
      source = source.replace(/<a href="viewer\.html">Open the asset viewer →<\/a>/g, '<p>The asset viewer is not included in this offline simulator.</p>');
      if (/viewer\.html/i.test(source)) fail('unrecognized asset viewer fallback');
    }
    return `// ${module.label}\n__modules[${module.id}] = (function(__deps) {\n${bindings}\n${source}\nreturn Object.freeze({\n${exports}\n});\n})([${module.dependencies.map(dependency => `__modules[${dependency.id}]`).join(',')}]);`;
  });
  const bundle = `(function() {\n'use strict';\nconst __modules = [];\n${factories.join('\n\n')}\n})();\n`;
  // Compilation validates the transformed code, but never executes project code.
  new Script(bundle, {filename: 'roadster-rocket-standalone.js'});
  const escaped = bundle.replace(/<\/script/gi, match => `<\\/${match.slice(2)}`);
  new Script(escaped, {filename: 'roadster-rocket-standalone-escaped.js'});
  html = html.replace(modules[0][0], () => `<script>\n${escaped}</script>`);
  const licensePath = path.join(dist, 'vendor/LICENSE.three');
  const license = await fs.readFile(licensePath, 'utf8');
  if (/--|<|>/.test(license)) fail('Three license cannot safely be embedded in an HTML comment');
  html = html.replace(/<head>/i, () => `<head>\n<!-- Three.js license\n${license}\n-->\n`);
  html = html.replace('Serve this folder with a static HTTP server.', 'Open this standalone file in a current browser.');
  const destination = await canonicalDestination(output);
  const protectedInputs = await Promise.all([index, cssPath, licensePath, ...ordered.map(module => module.filename)].map(file => fs.realpath(file)));
  if (protectedInputs.includes(destination)) fail('output would overwrite an input');
  await fs.mkdir(path.dirname(output), {recursive: true});
  await fs.writeFile(output, html, 'utf8');
  return {output, modules: ordered.length, bytes: Buffer.byteLength(html), entry: path.relative(dist, entry).split(path.sep).join('/'), files: ordered.map(module => module.label)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  buildSingleHTML().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
