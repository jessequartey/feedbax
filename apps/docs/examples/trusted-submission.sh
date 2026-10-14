curl --request POST https://feedback.example.com/api/v1/posts \
  --header "Authorization: Bearer $FEEDBAX_API_SECRET" \
  --header "Content-Type: application/json" \
  --header "Idempotency-Key: feedback-event-018" \
  --data '{"title":"Export feedback as CSV","description":"Useful for quarterly reviews","type":"Feature Request"}'
