.DEFAULT_GOAL := help
.PHONY: help install dev build clean check lint format format-fix typecheck test test-watch

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

typecheck: ## Typecheck
	pnpm typecheck

test: ## Run the test suite
	pnpm test

test-watch: ## Tests in watch mode
	pnpm test:watch
