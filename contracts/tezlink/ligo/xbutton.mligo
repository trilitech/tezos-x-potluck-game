module XButton = struct
  type storage = {
    last_player : address option;
    last_player_evm : bytes option; (* raw 20-byte EVM address, set by the relayer *)
    pot : nat;
    session_end : timestamp;
    claim_requested : bool;
    payout_completed : bool;
  }

  type return_ = operation list * storage

  [@entry]
  let start_session (duration : int) (store : storage) : return_ =
    (* Resets game even if a claim is still pending payout — demo escape hatch. *)
    ([], {
      store with
      last_player = (None : address option);
      last_player_evm = (None : bytes option);
      pot = 0n;
      session_end = Tezos.get_now () + duration;
      claim_requested = false;
      payout_completed = false
    })

  [@entry]
  let record_deposit ((player, player_evm, amount) : address * bytes * nat) (store : storage) : return_ =
    if Tezos.get_now () > store.session_end then
      (failwith "SESSION_ENDED" : return_)
    else if store.claim_requested then
      (failwith "CLAIM_ALREADY_REQUESTED" : return_)
    else
      ([], {
        store with
        last_player = Some player;
        last_player_evm = Some player_evm;
        pot = store.pot + amount
      })

  [@entry]
  let claim (_u : unit) (store : storage) : return_ =
    if Tezos.get_now () < store.session_end then
      (failwith "SESSION_ACTIVE" : return_)
    else if store.claim_requested then
      (failwith "CLAIM_ALREADY_REQUESTED" : return_)
    else if store.pot = 0n then
      (failwith "EMPTY_POT" : return_)
    else
      match store.last_player with
      | None -> (failwith "NO_LAST_PLAYER" : return_)
      | Some winner ->
          if Tezos.get_sender () <> winner then
            (failwith "NOT_LAST_PLAYER" : return_)
          else
            ([], { store with claim_requested = true })

  [@entry]
  let mark_paid (_u : unit) (store : storage) : return_ =
    if not store.claim_requested then
      (failwith "NO_CLAIM_REQUESTED" : return_)
    else if store.payout_completed then
      (failwith "ALREADY_PAID" : return_)
    else
      ([], { store with payout_completed = true })
end
