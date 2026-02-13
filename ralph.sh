  # /Users/phil/Projects/STRAT\ Trading\ Coach/ralph.sh
  #!/bin/bash

  PROMPT="$1"
  MAX_ITERATIONS=50
  ITERATION=0

  while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    echo "=== Ralph Iteration $((ITERATION + 1)) ==="

    # Call Claude with prompt
    claude "$PROMPT" > output.txt

    # Check for completion signal
    if grep -q "<promise>COMPLETE</promise>" output.txt; then
      echo "✅ Task completed successfully!"
      break
    fi

    # Check if tests pass (alternative completion check)
    npm run test:unit
    if [ $? -eq 0 ]; then
      echo "✅ All tests pass!"
      break
    fi

    ITERATION=$((ITERATION + 1))
    sleep 30  # Wait before next iteration
  done