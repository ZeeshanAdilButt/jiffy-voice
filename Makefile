.DEFAULT_GOAL := help
.PHONY: help install dev build clean check lint format format-fix typecheck test test-watch \
        example-embedded example-fast-path

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

## Development

install: ## Install dependencies
	pnpm install

dev: ## Rebuild on change
	pnpm dev

build: ## Build the package
	pnpm build

clean: ## Remove build output
	rm -rf dist coverage

## Quality

check: lint typecheck test build ## Everything CI runs

lint: ## Lint
	pnpm lint

format: ## Check formatting
	pnpm format

format-fix: ## Apply formatting
	pnpm format:write

typecheck: ## Typecheck source and examples
	pnpm typecheck

test: ## Run the test suite
	pnpm test

test-watch: ## Tests in watch mode
	pnpm test:watch

## Docker

up: ## Run the service on port 8080
	$(COMPOSE) up --build

down: ## Stop it
	$(COMPOSE) down

logs: ## Tail service logs
	$(COMPOSE) logs -f jiffy-voice

image: ## Build the container image
	docker build -t $(IMAGE) .

image-run: ## Run the built image
	docker run --rm -p 8080:8080 		-e JWT_SECRET=$${JWT_SECRET:-local-dev-secret-do-not-use-in-production} 		$(IMAGE)

## Examples

example-embedded: ## Run the in-process example
	pnpm example:embedded

example-fast-path: ## Run the fast-path and fallback example
	pnpm example:fast-path

## Kubernetes

k8s-validate: ## Validate manifests, no cluster needed
	kubectl kustomize k8s/ | kubectl apply --dry-run=client -f -

k8s-deploy: ## Apply manifests to the current context
	kubectl apply -k k8s/

k8s-delete: ## Remove manifests from the current context
	kubectl delete -k k8s/
