module CounterNacTutorial = struct
  type storage = int

  type return_ = operation list * storage

  [@entry]
  let increment (_u : unit) (s : storage) : return_ = ([], s + 1)

  [@entry]
  let decrement (_u : unit) (s : storage) : return_ =
    if s = 0 then (failwith "at zero" : return_) else ([], s - 1)

  [@entry]
  let reset (_u : unit) (_s : storage) : return_ = ([], 0)
end
