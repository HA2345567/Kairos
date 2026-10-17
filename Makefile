SHELL := /bin/sh

BUN ?= bun
IMAGE ?= kairos:dev

.PHONY: install test test-backend test-frontend build run-backend run-frontend docker-build docker-run contract-check

install:
	$(BUN) install --frozen-lockfile

# This is the single offline-safe project test command.
test:
	$(BUN) run test

test-backend:
	$(BUN) run test:backend

test-frontend:
	$(BUN) run test:frontend

build:
	$(BUN) run build

run-backend:
	$(BUN) run start:backend

run-frontend:
	$(BUN) run start:frontend

docker-build:
	docker build --tag $(IMAGE) .

docker-run:
	docker run --rm --env-file backend/.env -p 3001:3001 $(IMAGE)

contract-check:
	cargo check
