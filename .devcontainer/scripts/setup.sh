#!/usr/bin/env bash

# Create docker group, if it doesn't exist, and add our user to it
: `sudo groupadd -f docker`
sudo usermod -aG docker $USER

# Prepare node environment
npm i && npm ci