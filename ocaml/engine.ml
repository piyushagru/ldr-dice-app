type die = D4 | D6 | D8 | D10 | D12 | D20 | D100

type spec = {
  count : int;
  die : die;
  modifier : int;
}

type error =
  | Invalid_notation
  | Invalid_count
  | Invalid_sides
  | Invalid_modifier

type outcome = {
  rolls : int list;
  subtotal : int;
  total : int;
}

let max_dice = 10
let max_modifier = 99

let all_dice = [ D4; D6; D8; D10; D12; D20; D100 ]

let sides_of_die = function
  | D4 -> 4
  | D6 -> 6
  | D8 -> 8
  | D10 -> 10
  | D12 -> 12
  | D20 -> 20
  | D100 -> 100

let die_of_sides n = List.find_opt (fun d -> sides_of_die d = n) all_dice

let dice_sides = List.map sides_of_die all_dice

let validate_parts ~count ~sides ~modifier =
  if count < 1 || count > max_dice then Error Invalid_count
  else
    match die_of_sides sides with
    | None -> Error Invalid_sides
    | Some die ->
        if abs modifier > max_modifier then Error Invalid_modifier
        else Ok { count; die; modifier }

(* Mirrors JS Number.isInteger, including rejecting NaN/Infinity and values
   too large to survive the 32-bit int conversion under js_of_ocaml. *)
let as_int x =
  if Float.is_finite x && Float.is_integer x && Float.abs x <= 1e6 then
    Some (int_of_float x)
  else None

let validate ~count ~sides ~modifier =
  match (as_int count, as_int sides, as_int modifier) with
  | Some count, Some sides, Some modifier -> validate_parts ~count ~sides ~modifier
  | None, _, _ -> Error Invalid_count
  | _, None, _ -> Error Invalid_sides
  | _, _, None -> Error Invalid_modifier

let parse_notation text =
  let len = String.length text in
  let is_space c =
    c = ' ' || c = '\t' || c = '\n' || c = '\r' || c = '\011' || c = '\012'
  in
  let is_digit c = '0' <= c && c <= '9' in
  let rec skip_spaces i =
    if i < len && is_space text.[i] then skip_spaces (i + 1) else i
  in
  let digits ~limit i =
    let rec stop j =
      if j < len && j - i < limit && is_digit text.[j] then stop (j + 1) else j
    in
    let j = stop i in
    if j = i then None else Some (int_of_string (String.sub text i (j - i)), j)
  in
  let i = skip_spaces 0 in
  let count, i =
    match digits ~limit:2 i with Some (n, j) -> (n, j) | None -> (1, i)
  in
  let i = skip_spaces i in
  if i >= len || (text.[i] <> 'd' && text.[i] <> 'D') then Error Invalid_notation
  else
    let i = skip_spaces (i + 1) in
    match digits ~limit:3 i with
    | None -> Error Invalid_notation
    | Some (sides, i) -> (
        let i = skip_spaces i in
        let modifier_at i =
          if i < len && (text.[i] = '+' || text.[i] = '-') then
            let sign = if text.[i] = '-' then -1 else 1 in
            match digits ~limit:3 (skip_spaces (i + 1)) with
            | None -> None
            | Some (n, j) -> Some (sign * n, j)
          else Some (0, i)
        in
        match modifier_at i with
        | None -> Error Invalid_notation
        | Some (modifier, i) ->
            if skip_spaces i <> len then Error Invalid_notation
            else validate_parts ~count ~sides ~modifier)

let roll ~rng ~count ~sides ~modifier =
  let rolls = List.init count (fun _ -> rng sides) in
  let subtotal = List.fold_left ( + ) 0 rolls in
  { rolls; subtotal; total = subtotal + modifier }

let canonical_notation ~count ~sides ~modifier =
  let suffix =
    if modifier = 0 then ""
    else if modifier > 0 then Printf.sprintf "+%d" modifier
    else string_of_int modifier
  in
  Printf.sprintf "%dd%d%s" count sides suffix
