# Learning OCaml through PipWorks

PipWorks, the SpiceDice dice engine, is now implemented in OCaml and compiled
to JavaScript. This walkthrough teaches OCaml *through that code*: every
concept is illustrated with the actual source in `ocaml/`, so you can read,
break, rebuild, and experiment with a real working system instead of toy
examples.

You should already know the app: `pipworks.js` exposes `parseNotation`,
`validateSpec`, and `roll`, and `server.js` treats it as a black box. Nothing
about that changed: only who does the thinking underneath.

---

## 1. Toolchain tour

### The pieces

| Tool | Role | Closest JS analogue |
|---|---|---|
| **opam** | Package manager + compiler version manager | npm + nvm in one |
| **switch** | A named, isolated compiler + package universe | `node_modules` + a pinned Node version, per project |
| **dune** | Build system (compiles, tracks deps, runs tests) | a much smarter `npm run build` |
| **js_of_ocaml** | Compiles OCaml bytecode to a single `.js` file | think of it as a transpiler backend |
| **utop** | Interactive REPL with completion | the `node` REPL, but type-aware |

This repo uses an opam switch named `spicedice` with OCaml 5.2.1, dune, and
js_of_ocaml 6.4.1. A *switch* matters because OCaml libraries are compiled
against one specific compiler version; switches keep projects from trampling
each other. `opam exec --switch=spicedice -- CMD` runs any command inside that
universe, or run `eval $(opam env --switch=spicedice)` once per shell to make
`dune`, `ocaml`, and `utop` directly available.

### What each file in `ocaml/` does

| File | Purpose |
|---|---|
| `dune-project` | Marks the project root and pins the dune language version. One line. |
| `dune` | Build rules: an `engine` library, a `bridge` executable compiled in `(modes js)`, and a rule that copies the compiled output to `pipworks_ocaml.js` and *promotes* it (writes it into the source dir so Node can `require` it). |
| `engine.mli` | The **interface** of the engine: the only things the outside world may see. |
| `engine.ml` | The **implementation**: types, parser, validation, rolling. Pure logic, no JavaScript anywhere. |
| `bridge.ml` | The FFI layer: converts JS strings/numbers/functions to OCaml values and back, and exports the three functions to `module.exports`. |
| `pipworks_ocaml.js` | The build artifact (~2.3 MB, includes the OCaml runtime). Gitignored, a build product, never committed; Docker builds it on deploy. `pipworks.js` loads it when present. Regenerate with `dune build`; never edit by hand. |

A key design point: `engine.ml` knows nothing about JavaScript, and
`bridge.ml` contains no dice logic. That separation is tenant T5 (SOLID)
expressed in OCaml, and it is also what makes the engine trivially testable
in utop.

---

## 2. OCaml concepts, one at a time

### 2.1 `let` bindings and immutability

Everything in OCaml is a `let`. There is no `const`/`var` distinction because
*everything* is `const`:

```ocaml
let max_dice = 10
let max_modifier = 99
```
 `ocaml/engine.ml:21-22`

Functions are also just `let` bindings whose value happens to be a function:

```ocaml
let die_of_sides n = List.find_opt (fun d -> sides_of_die d = n) all_dice
```
 `ocaml/engine.ml:35`

Inside the parser you'll see what looks like reassignment:

```ocaml
let i = skip_spaces 0 in
let count, i =
  match digits ~limit:2 i with Some (n, j) -> (n, j) | None -> (1, i)
in
let i = skip_spaces i in
```
 `ocaml/engine.ml:78-82`

This is **shadowing**, not mutation: each `let i = … in` introduces a *new*
binding named `i` that hides the previous one. The old value still exists; it
just has no name anymore. Compare with the JS fallback's `for` loop over a
mutable `subtotal` (`pipworks.js:76-81`): the OCaml version threads new
values forward instead of overwriting old ones.

### 2.2 Variants and records

A **variant** is a type that says "exactly one of these, nothing else":

```ocaml
type die = D4 | D6 | D8 | D10 | D12 | D20 | D100
```
 `ocaml/engine.ml:1`

In JS, "supported dice" is a runtime array (`DICE_SIDES`, `pipworks.js:11`)
and any number can pretend to be a die until `.includes()` says otherwise. In
OCaml a `die` value *cannot* be a d7: the illegal state is unrepresentable at
compile time. That is the single biggest mindset shift OCaml asks of you.

A **record** is a struct with named, typed fields:

```ocaml
type spec = {
  count : int;
  die : die;
  modifier : int;
}
```
 `ocaml/engine.ml:3-7`

Note `die : die` rather than `sides : int`: a validated spec holds a *proven*
die, not a number someone promises is fine. The `outcome` record
(`ocaml/engine.ml:15-19`) plays the same role for roll results.

### 2.3 Pattern matching

Pattern matching is `switch` that the compiler checks for completeness:

```ocaml
let sides_of_die = function
  | D4 -> 4
  | D6 -> 6
  | D8 -> 8
  | D10 -> 10
  | D12 -> 12
  | D20 -> 20
  | D100 -> 100
```
 `ocaml/engine.ml:26-33`

Delete the `D100` line and rebuild: the compiler tells you exactly which case
you forgot. (Try it. Seriously. Watching the exhaustiveness checker catch you
is the fastest way to trust it.)

You can match on several values at once. `validate` checks three JS numbers
and pinpoints which one is bad, in one expression:

```ocaml
let validate ~count ~sides ~modifier =
  match (as_int count, as_int sides, as_int modifier) with
  | Some count, Some sides, Some modifier -> validate_parts ~count ~sides ~modifier
  | None, _, _ -> Error Invalid_count
  | _, None, _ -> Error Invalid_sides
  | _, _, None -> Error Invalid_modifier
```
 `ocaml/engine.ml:55-60`

`_` means "anything". The first `Some count, …` arm also *rebinds* the names 
inside that arm, `count` is the unwrapped `int`, shadowing the `float`
parameter.

The parser (`ocaml/engine.ml:62-102`) is pattern matching used in anger: the
JS regex `/^\s*(\d{1,2})?\s*d\s*(\d{1,3})…$/i` (`pipworks.js:18`) became
explicit character-by-character functions (`skip_spaces`, `digits`) whose
results are matched to decide what comes next. More verbose than a regex 
and every branch, including the failure paths, is visible and typed.

### 2.4 `Result` and error handling

There are no exceptions in this engine and no `null` anywhere. A function that
can fail says so in its type:

```ocaml
val parse_notation : string -> (spec, error) result
```
 `ocaml/engine.mli:28`

`result` is just a built-in variant: `Ok of 'a | Error of 'b`. The engine's
error side is its own variant:

```ocaml
type error =
  | Invalid_notation
  | Invalid_count
  | Invalid_sides
  | Invalid_modifier
```
 `ocaml/engine.ml:9-13`

The JS API collapses all failures into `null`, so the OCaml engine is
strictly *more* informative than its public surface. The collapse happens in
one place, at the boundary:

```ocaml
let or_null = function
  | Ok spec -> js_spec spec
  | Error _ -> inject Js.null
```
 `ocaml/bridge.ml:13-15`

This is the idiomatic shape: rich errors inside, lossy conversion only at the
edge. If SpiceDice ever wanted error *messages* in its 400 responses, only
`or_null` would change.

### 2.5 Modules and interfaces (`.mli`)

Every `.ml` file is automatically a module: `engine.ml` defines the module
`Engine` (capitalized file name), which is why `bridge.ml` says
`Engine.parse_notation`.

The `.mli` file is the module's *public interface*. Anything not listed there
is invisible to other modules. Compare:

- `ocaml/engine.mli` exports `parse_notation`, `validate`, `roll`,
  `canonical_notation`, the types, and three constants.
- `ocaml/engine.ml` *also* defines `all_dice`, `validate_parts`, and `as_int`
   try calling `Engine.as_int` from `bridge.ml`: the compiler refuses,
  because the `.mli` doesn't mention it.

This is the same encapsulation instinct as not exporting a helper from a JS
module, but enforced by the type checker rather than by convention. Note the
interface is a separate file you can read in one screen: it *is* the
documentation.

### 2.6 Higher-order functions and the injected RNG (tenant T1)

The most important design constraint in the whole swap: **the OCaml engine
never generates randomness**. It takes a function:

```ocaml
let roll ~rng ~count ~sides ~modifier =
  let rolls = List.init count (fun _ -> rng sides) in
  let subtotal = List.fold_left ( + ) 0 rolls in
  { rolls; subtotal; total = subtotal + modifier }
```
 `ocaml/engine.ml:104-107`

`~rng` is a labeled argument of type `int -> int`: a function passed as a
value, i.e. a higher-order function. `List.init count f` builds a list by
calling `f` count times (like `Array.from({length: count}, f)`), and
`List.fold_left ( + ) 0` is `reduce((a, b) => a + b, 0)`, note that even the
`+` operator is just a function you can pass around.

The actual randomness is injected from JS, where `crypto.randomInt` lives:

```js
return ocaml.roll(spec.count, spec.sides, spec.modifier,
  (sides) => randomInt(1, sides + 1));
```
 `pipworks.js:72-73`

So tenant T1 (crypto-fair, zero modulo bias) is preserved *by construction*:
the OCaml side cannot roll on its own even by accident, because it has no RNG
to call. Dependency injection, enforced by the type system.

### 2.7 The js_of_ocaml FFI boundary

`bridge.ml` is the only file where the two worlds touch. The traffic in each
direction:

**JS → OCaml.** JS strings arrive as `Js.js_string Js.t` and must be
converted: `Js.to_string text` (`ocaml/bridge.ml:17`). JS numbers arrive as
OCaml `float`s, which is why `Engine.validate` takes floats and does its own
`Number.isInteger`-style check (`as_int`, `ocaml/engine.ml:48-53`). A JS
function arrives as an opaque value and is called with
`Js.Unsafe.fun_call rng_fn [| inject s |]` (`ocaml/bridge.ml:23`).

**OCaml → JS.** Plain JS objects are built field by field:

```ocaml
Js.Unsafe.obj
  [|
    ("count", inject spec.Engine.count);
    ("sides", inject (Engine.sides_of_die spec.Engine.die));
    ("modifier", inject spec.Engine.modifier);
  |]
```
 `ocaml/bridge.ml:5-11`

Notice `sides_of_die` here: the internal representation (a `die` variant)
converts back to the number the JS API promised. Lists become arrays with
`Js.array (Array.of_list …)`, strings with `Js.string`.

**Exporting.** `Js.export "parseNotation" (Js.wrap_callback parse_notation)`
(`ocaml/bridge.ml:38-41`) attaches each function to `module.exports`, so Node
sees a perfectly ordinary CommonJS module.

**Division of labor.** JavaScript's weirdness stays in JavaScript:
`typeof notation !== 'string'` (`pipworks.js:36`) and the
`Number(spec.count ?? 1)` coercion-with-defaults (`pipworks.js:53-55`) run in
the wrapper *before* OCaml is called. The OCaml engine never has to know that
`Number(true) === 1`. When you write an FFI boundary, put each language's
idiosyncrasies on its own side.

Finally, the fallback machinery: `pipworks.js:22-31` tries to
`require('./ocaml/pipworks_ocaml.js')` and returns `null` only on
`MODULE_NOT_FOUND`, and every public function branches on `ocaml` being
present. `require('./pipworks').backend` tells you which engine you're on.

---

## 3. Exercises

Graded ★ (gentle) to ★★★ (project). After each change: rebuild
(section 4), then `npm test`: for behavior-preserving exercises all 19 tests
must still pass. Exercises that intentionally change behavior say so; do them
on a scratch branch or revert after, since the shipped engine must stay
byte-identical to the JS fallback.

**Ex 1 ★ — Read types in utop.** Start `dune utop` (section 4), then:
`Engine.parse_notation "3d6+2"`, `Engine.parse_notation "banana"`,
`Engine.roll ~rng:(fun _ -> 4) ~count:3 ~sides:6 ~modifier:0`. Look at the
*types* utop prints before the values. Why does the fixed `rng` make `roll`
deterministic here, and why is that useful for testing?

**Ex 2 ★ — Break exhaustiveness.** Delete the `D100 -> 100` line from
`sides_of_die` and run `dune build`. Read the error. Add a new die `D2` to the
`die` type instead and follow the compiler errors until it builds
(`all_dice`, `sides_of_die`). Run `npm test`, and a test fails, because the JS
fallback and tests don't know d2. Revert. Lesson: the compiler walks you
through a change, the *tests* guard cross-language parity.

**Ex 3 ★ — Error messages.** Write `error_to_string : error -> string` in
`engine.ml` (pattern match, four arms), expose it in `engine.mli`, and print
one in utop. You've just done the whole module-interface dance.

**Ex 4 ★★ — A d∞ error case.** In utop, `Engine.parse_notation "1d0"` and
`"1d1000"` both give `Error Invalid_sides` — but `parse_notation "1d∞"` gives
`Error Invalid_notation`. Trace through `parse_notation`
(`ocaml/engine.ml:62-102`) and explain exactly which check rejects each of
the three. Then add a distinct `Unsupported_die of int` error constructor
that `validate_parts` returns instead of `Invalid_sides`, carrying the
offending number (variants can carry data!). Update every place the compiler
complains about. Behavior through the JS API is unchanged (still `null`) —
confirm with `npm test`.

**Ex 5 ★★ — Write a test in OCaml.** Create `ocaml/test_engine.ml` with:

```ocaml
let () =
  assert (Engine.parse_notation "3d6+2"
          = Ok { Engine.count = 3; die = Engine.D6; modifier = 2 });
  assert (Engine.parse_notation "11d6" = Error Engine.Invalid_count);
  let outcome = Engine.roll ~rng:(fun _ -> 1) ~count:2 ~sides:6 ~modifier:5 in
  assert (outcome.Engine.total = 7);
  print_endline "ocaml tests OK"
```

Add to `ocaml/dune`:

```lisp
(test
 (name test_engine)
 (modules test_engine)
 (libraries engine))
```

Run `dune test`. Note you can test the engine natively — no Node, no browser,
because the engine has no JS in it.

**Ex 6 ★★ — Property test the parser.** Extend `test_engine.ml`: generate
every string `"{c}d{s}"` for `c` in 0–15 and `s` in 1–120, and assert
`parse_notation` agrees with `validate ~count ~sides ~modifier:0.0` on all of
them (`Stdlib.float_of_int` converts). You'll use nested loops or
`List.concat_map` — try the latter.

**Ex 7 ★★★ — Drop-lowest notation (`4d6dl1`).** The classic D&D stat roll:
roll 4d6, drop the lowest. On a scratch branch:

1. Add `drop_lowest : int` to the `spec` record (default 0). The compiler
   lists every construction site you must update — fix them one by one.
2. In `parse_notation`, after the modifier, accept an optional suffix
   `dl` + 1 digit (mirror how `modifier_at` handles `+`/`-`;
   remember `d` vs `D` case).
3. In `roll`, when `drop_lowest > 0`: sort the rolls
   (`List.sort compare rolls`), drop the first `drop_lowest`
   elements, sum the rest for `subtotal` — but keep the *full* list in
   `rolls` so players see every die.
4. Validate: `drop_lowest < count`, else a new error.
5. Thread it through `bridge.ml` and `pipworks.js`, and write the JS-fallback
   twin plus tests.

Hints: step 3 is pure `List` pipeline practice — try
`rolls |> List.sort compare |> fun l -> List.filteri (fun i _ -> i >= n) l`.
Step 2 is the hard one; get `"4d6dl1"`, `"4d6+2dl1"` rejected-or-accepted
decisions written down *before* coding. This exercise changes behavior — it's
a feature, so tests must be *added*, not changed.

**Ex 8 ★★★ — Chi-square in OCaml.** Reimplement the uniformity check that
validated this swap, natively: roll 600k d6 with
`~rng:(fun s -> 1 + Random.int s)` (fine for a *statistics* test — never for
production rolls, tenant T1), tally with an `Array`, compute χ². Compare the
mutable-`Array` tally with an immutable fold — which reads better here?
Honest answer: the array. OCaml lets you mutate when it's the right tool.

---

## 4. Rebuild and experiment

All commands run from `ocaml/`.

```bash
# once per shell (or prefix every command with: opam exec --switch=spicedice --)
eval $(opam env --switch=spicedice)

dune build            # compile + regenerate pipworks_ocaml.js in ocaml/
                      # (same as: npm run build:engine from the repo root)
dune build -w         # watch mode: rebuild on every save
dune clean            # remove _build AND the promoted pipworks_ocaml.js
dune test             # run OCaml tests (after Ex 5)
```

After `dune build`, verify from the repo root:

```bash
node -e "console.log(require('./pipworks').backend)"   # → ocaml
npm test                                               # → 19 pass
```

To prove the fallback still works, hide the artifact and check again:

```bash
mv ocaml/pipworks_ocaml.js /tmp/ && node -e "console.log(require('./pipworks').backend)"  # → js
mv /tmp/pipworks_ocaml.js ocaml/
```

### Poking at the engine in utop

```bash
dune utop . # inside ocaml/ — loads the engine library, then:
```

```ocaml
Engine.parse_notation "2d10-1";;
Engine.dice_sides;;
Engine.validate ~count:1.5 ~sides:6.0 ~modifier:0.0;;
Engine.roll ~rng:(fun s -> s) ~count:3 ~sides:20 ~modifier:0;;  (* always max *)
#show Engine;;   (* print the whole interface *)
```

`;;` ends a phrase in the REPL (not needed in source files). `#show Engine`
prints `engine.mli` back at you — the interface really is the documentation.

If `utop` is missing: `opam install --switch=spicedice utop`.
