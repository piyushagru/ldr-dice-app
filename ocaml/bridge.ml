open Js_of_ocaml

let inject = Js.Unsafe.inject

let js_spec (spec : Engine.spec) =
  Js.Unsafe.obj
    [|
      ("count", inject spec.Engine.count);
      ("sides", inject (Engine.sides_of_die spec.Engine.die));
      ("modifier", inject spec.Engine.modifier);
    |]

let or_null = function
  | Ok spec -> js_spec spec
  | Error _ -> inject Js.null

let parse_notation text = or_null (Engine.parse_notation (Js.to_string text))

let validate_spec count sides modifier =
  or_null (Engine.validate ~count ~sides ~modifier)

let roll count sides modifier rng_fn =
  let rng s = Js.Unsafe.fun_call rng_fn [| inject s |] in
  let outcome = Engine.roll ~rng ~count ~sides ~modifier in
  Js.Unsafe.obj
    [|
      ("rolls", inject (Js.array (Array.of_list outcome.Engine.rolls)));
      ("subtotal", inject outcome.Engine.subtotal);
      ("total", inject outcome.Engine.total);
      ("count", inject count);
      ("sides", inject sides);
      ("modifier", inject modifier);
      ( "notation",
        inject (Js.string (Engine.canonical_notation ~count ~sides ~modifier))
      );
    |]

let () =
  Js.export "parseNotation" (Js.wrap_callback parse_notation);
  Js.export "validateSpec" (Js.wrap_callback validate_spec);
  Js.export "roll" (Js.wrap_callback roll)
