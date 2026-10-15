# Snapshot existing Comments when following

Production validation exposed minute-rounded Notion Post and Comment timestamps: a change made after following could have a timestamp earlier than the Follow. Status notifications now compare each Follow's observed status and give every observed transition its own transaction-fenced event. Follow creation snapshots existing same-minute Comment IDs so later Comments with the same timestamp are distinguishable without sending historical notices.

A single bounded Comment page normally establishes the baseline immediately. Longer histories prepare across bounded background pages; the UI shows preparation and permits cancellation. Updates start after preparation completes. Atomic baseline writes, owner-token fencing, and cascading cleanup preserve idempotent cross-browser Follow and safe cancellation. Content remains in Notion; these private baseline records are operational state in D1.

Migration puts existing Follows into the same bounded preparation flow before activating the new Comment eligibility rule. This prevents historical Comments in the original Follow minute from becoming new notifications after upgrading.
