# ----------- 
# Websimbench
# -----------

# Run the development server
dev:
	npm run dev

# Build the workspace
build:
	npm run build

# -----------
# Agentyx
# -----------

# Build and typecheck the agentyx package specifically
build-agentyx:
	npm run build:pkg

# Run just agentyx tests
test-agentyx:
	npm run test --workspace @websimbench/agentyx

# Publish the agentyx package to NPM (requires auth)
publish-agentyx: build-agentyx
	cd packages/agentyx && npm publish --access public

npm-auth: 
  npm login
