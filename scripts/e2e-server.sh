#!/bin/bash
set -e
make ui-build
NODE_ENV=test node server/server.js
