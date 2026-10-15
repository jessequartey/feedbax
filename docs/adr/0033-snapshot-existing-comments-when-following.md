# Snapshot existing Comments when following

Production validation exposed minute-rounded Notion Post and Comment timestamps: a change made after following could have a timestamp earlier than the Follow. Status notifications now compare each Follow's observed status and give every observed transition its own transaction-fenced event. Follow creation snapshots existing same-minute Comment IDs so later Comments with the same timestamp are distinguishable without sending historical notices.

Workers Free production measurements showed that reading the first 50 Comments in the Follow request could use 13–19 ms CPU. Small mode therefore prepares every new Follow entirely in the queue. Standard mode establishes the first page immediately and resumes longer histories in the background; the UI shows preparation and permits cancellation. Updates start after preparation completes. Atomic baseline writes, owner-token fencing, and cascading cleanup preserve idempotent cross-browser Follow and safe cancellation. Content remains in Notion; these private baseline records are operational state in D1.

Migration puts existing Follows into the same bounded preparation flow before activating the new Comment eligibility rule. This prevents historical Comments in the original Follow minute from becoming new notifications after upgrading.
