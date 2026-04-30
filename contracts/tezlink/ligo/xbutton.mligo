module XButton = struct
  type pending_session = {
    winner_tezos : address;
    winner_evm : bytes;
    pot : nat;
    session_end : timestamp;
    claim_requested : bool;
  }

  type active_session = {
    last_player_tezos : address option;
    last_player_evm : bytes option;
    pot : nat;
    session_end : timestamp;
    claim_requested : bool;
  }

  type storage = {
    current_session_id : nat;
    current_session : active_session;
    pending_session_ids : nat list;
    pending_sessions : (nat, pending_session) map;
  }

  type return_ = operation list * storage

  let empty_active_session (session_end : timestamp) : active_session = {
    last_player_tezos = (None : address option);
    last_player_evm = (None : bytes option);
    pot = 0n;
    session_end;
    claim_requested = false;
  }

  let rec remove_pending_id (target : nat) (ids : nat list) : nat list =
    match ids with
    | [] -> []
    | head :: tail ->
        if head = target then
          remove_pending_id target tail
        else
          head :: remove_pending_id target tail

  let archive_current_session (store : storage) : storage =
    if store.current_session.pot = 0n then
      store
    else
      match (store.current_session.last_player_tezos, store.current_session.last_player_evm) with
      | (Some winner_tezos, Some winner_evm) ->
          let archived : pending_session = {
            winner_tezos;
            winner_evm;
            pot = store.current_session.pot;
            session_end = store.current_session.session_end;
            claim_requested = store.current_session.claim_requested;
          } in
          {
            store with
            pending_session_ids = store.current_session_id :: store.pending_session_ids;
            pending_sessions = Map.add store.current_session_id archived store.pending_sessions;
          }
      | _ -> (failwith "INCONSISTENT_CURRENT_SESSION" : storage)

  let assert_claimable_active (sender : address) (session : active_session) : unit =
    if Tezos.get_now () < session.session_end then
      (failwith "SESSION_ACTIVE" : unit)
    else if session.claim_requested then
      (failwith "CLAIM_ALREADY_REQUESTED" : unit)
    else if session.pot = 0n then
      (failwith "EMPTY_POT" : unit)
    else
      match session.last_player_tezos with
      | None -> (failwith "NO_LAST_PLAYER" : unit)
      | Some winner ->
          if sender <> winner then
            (failwith "NOT_LAST_PLAYER" : unit)
          else
            ()

  let assert_claimable_pending (sender : address) (session : pending_session) : unit =
    if Tezos.get_now () < session.session_end then
      (failwith "SESSION_ACTIVE" : unit)
    else if session.claim_requested then
      (failwith "CLAIM_ALREADY_REQUESTED" : unit)
    else if session.pot = 0n then
      (failwith "EMPTY_POT" : unit)
    else if sender <> session.winner_tezos then
      (failwith "NOT_LAST_PLAYER" : unit)
    else
      ()

  [@entry]
  let start_session (duration : int) (store : storage) : return_ =
    if duration <= 0 then
      (failwith "INVALID_DURATION" : return_)
    else if Tezos.get_now () < store.current_session.session_end then
      (failwith "SESSION_ACTIVE" : return_)
    else
      let archived_store = archive_current_session store in
      let next_session_id = archived_store.current_session_id + 1n in
      let next_session = empty_active_session (Tezos.get_now () + duration) in
      ([], {
        archived_store with
        current_session_id = next_session_id;
        current_session = next_session;
      })

  [@entry]
  let record_deposit ((session_id, player, player_evm, amount) : nat * address * bytes * nat) (store : storage) : return_ =
    if session_id <> store.current_session_id then
      (failwith "SESSION_ID_MISMATCH" : return_)
    else if Tezos.get_now () > store.current_session.session_end then
      (failwith "SESSION_ENDED" : return_)
    else if store.current_session.claim_requested then
      (failwith "CLAIM_ALREADY_REQUESTED" : return_)
    else
      let next_session = {
        store.current_session with
        last_player_tezos = Some player;
        last_player_evm = Some player_evm;
        pot = store.current_session.pot + amount;
      } in
      ([], { store with current_session = next_session })

  [@entry]
  let claim (session_id : nat) (store : storage) : return_ =
    if session_id = store.current_session_id then
      let () = assert_claimable_active (Tezos.get_sender ()) store.current_session in
      let next_session = { store.current_session with claim_requested = true } in
      ([], { store with current_session = next_session })
    else
      match Map.find_opt session_id store.pending_sessions with
      | None -> (failwith "UNKNOWN_SESSION" : return_)
      | Some session ->
          let () = assert_claimable_pending (Tezos.get_sender ()) session in
          let updated_session = { session with claim_requested = true } in
          ([], {
            store with
            pending_sessions = Map.add session_id updated_session store.pending_sessions;
          })

  [@entry]
  let mark_paid (session_id : nat) (store : storage) : return_ =
    if session_id = store.current_session_id then
      if not store.current_session.claim_requested then
        (failwith "NO_CLAIM_REQUESTED" : return_)
      else
        let cleared_session = empty_active_session store.current_session.session_end in
        ([], { store with current_session = cleared_session })
    else
      match Map.find_opt session_id store.pending_sessions with
      | None -> (failwith "UNKNOWN_SESSION" : return_)
      | Some session ->
          if not session.claim_requested then
            (failwith "NO_CLAIM_REQUESTED" : return_)
          else
            ([], {
              store with
              pending_session_ids = remove_pending_id session_id store.pending_session_ids;
              pending_sessions = Map.remove session_id store.pending_sessions;
            })
end
