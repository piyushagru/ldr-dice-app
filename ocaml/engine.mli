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

val max_dice : int
val max_modifier : int
val dice_sides : int list

val sides_of_die : die -> int
val die_of_sides : int -> die option

val parse_notation : string -> (spec, error) result
val validate : count:float -> sides:float -> modifier:float -> (spec, error) result
val roll : rng:(int -> int) -> count:int -> sides:int -> modifier:int -> outcome
val canonical_notation : count:int -> sides:int -> modifier:int -> string
