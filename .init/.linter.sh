#!/bin/bash
cd /home/kavia/workspace/code-generation/data-crossplot-explorer-111162-111171/csv_crossplotter_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

