# OpenProject AI Coding Agent Instructions

> **Note for developers**: You can create `AGENTS.local.md` (or `CLAUDE.local.md`) in this directory to add your own custom instructions or preferences for AI coding agents. These files are git-ignored and will not be committed to the repository.

## Repository Overview

**OpenProject** is a web-based, open-source project management software written in Ruby on Rails with PostgreSQL for data persistence.

- **Size**: Large monorepo (~840MB, ~1M+ lines of code)
- **Backend**: Ruby 3.4.7, Rails ~8.0.3
- **Frontend**: Node.js 22.21.0, npm 10.1.0+, TypeScript
- **Database**: PostgreSQL (required)
- **Architecture**: Server-rendered HTML with Hotwire (Turbo + Stimulus). Legacy Angular components exist and are being migrated to custom elements. Uses GitHub's Primer Design System via ViewComponent.
- **Editions**: Community, Enterprise (SSO, LDAP, SCIM), and BIM (construction industry, code in `modules/bim/`)

## Critical Setup Requirements

**ALWAYS verify versions before building:**
- Ruby: `3.4.7` (see `.ruby-version`)
- Node: `^22.21.0` (see `package.json` engines)
- Bundler: Latest 2.x

### Local Development Setup

```bash
bundle install                    # Install Ruby gems
cd frontend && npm ci && cd ..   # Install Node packages
bundle exec rails db:migrate      # Setup database
bin/dev                          # Start all services (Rails, frontend, Good Job worker)
# Access at http://localhost:3000
```

### Docker Development Setup

See [`docker/dev/AGENTS.md`](docker/dev/AGENTS.md) for full Docker setup and commands.

## Project Structure

### Key Directories

- `app/` — Rails application code
- `config/` — Rails configuration, routes, locales
- `db/` — Database migrations and seeds
- `docker/dev/` — Docker development environment
- `frontend/` — TypeScript/Angular/Stimulus frontend
- `lib/` — Ruby libraries and extensions
- `lookbook/` — ViewComponent previews (<https://qa.openproject-edge.com/lookbook/>)
- `modules/` — OpenProject plugin modules
- `spec/` — RSpec test suite

### Configuration Files

- `.ruby-version` - Ruby version
- `.rubocop.yml` - Ruby linting rules
- `.erb_lint.yml` - ERB template linting
- `frontend/eslint.config.mjs` - JavaScript/TypeScript linting
- `Gemfile` - Ruby dependencies
- `package.json` / `frontend/package.json` - Node.js dependencies
- `lefthook.yml` - Git hooks configuration

### Linting (Run Before Committing)

```bash
# Ruby
bundle exec rubocop                              # Check all files
bin/dirty-rubocop --uncommitted                  # Check only uncommitted changes

# JavaScript/TypeScript
cd frontend && npx eslint src/ && cd ..

# ERB Templates
erb_lint {files}

# Install Git Hooks (recommended)
bundle exec lefthook install
```

## Testing

```bash
# RSpec (backend) — there is no root .rspec; config lives in spec/{spec,rails}_helper.rb
bundle exec rspec spec/models/user_spec.rb        # Single file
bundle exec rspec spec/models/user_spec.rb:42     # Single example (by line number)
bundle exec rspec spec/features                   # A directory
bin/rspec ...                                      # Same as above, but through the Spring preloader (faster reboots)

# Parallel runs (parallel_tests gem) — used in CI; each worker gets its own test DB
bundle exec rake parallel:units                   # Non-feature specs
bundle exec rake parallel:features                # Feature/system specs
bundle exec rake parallel:plugins:specs           # Specs inside modules/
bundle exec rake parallel:specs -- -n 4           # Limit to 4 workers

# Frontend (Angular/Karma) — run from frontend/ or via the root proxy script
cd frontend && npm test          # Headless, single run
cd frontend && npm run test:watch
```

- Specs for a module live under `modules/<name>/spec/`. Run a single one with the same `bundle exec rspec modules/<name>/spec/...` form.
- Test data uses **FactoryBot**; `test-prof` helpers (`let_it_be`, `before_all`) are available and preferred for expensive setup in large spec files.

## Commit Messages
- First line: < 72 characters, then blank line, then detailed description
- Reference work packages when applicable
- Merge strategy: "Merge pull request" (not squash), except single-commit PRs can use "Rebase and merge"

## Architecture & Key Patterns

These conventions span many files; understanding them is the fastest path to being productive. Do not bypass them (e.g. don't raise for business-logic failures, don't write models directly in controllers).

### Service objects + ServiceResult
Business logic lives in `app/services/`, never in controllers or models. Services inherit from `BaseServices::{Create,Update,Delete,SetAttributes}` (built on `BaseContracted`) and **always return a `ServiceResult`** instead of raising:

```ruby
result = Projects::UpdateService.new(user:, model: @project).call(params)
result.success?            # => bool
result.result              # the model
result.errors              # ActiveModel::Errors
result.on_success { |r| }  # callbacks; .merge!/.bind for composing results
```

The contracted lifecycle is: `validate_params → before_perform → validate_contract → persist → after_perform`. A service finds its contract by convention (`Projects::UpdateService` → `Projects::UpdateContract`).

### Contracts (validation + authorization)
Contracts in `app/contracts/` are Disposable::Twin form objects (base: `BaseContract`). They declare which attributes are writable, **gate each on a permission**, and hold validations. Writability is reduced based on the user's permissions, so authorization is enforced at the contract layer — not just the controller.

### Permissions
Permissions are declared per project-module via `OpenProject::AccessControl.map` (see `lib/open_project/access_control.rb` and each module's engine). Check them with the contextual helpers, not by inspecting roles directly:

```ruby
user.allowed_in_project?(:edit_work_packages, project)
user.allowed_in_work_package?(:view, work_package)
user.allowed_globally?(:manage_global_roles)
```

### APIv3 (Grape + Roar representers)
The REST API lives in `lib/api/v3/`. Resources are serialized by **representers** (`lib/api/decorators/`, base `API::Decorators::Single`) using Roar's DSL of `property`, `link` (HATEOAS), and embedded `resources`. The representer *is* the public API contract — changing a property changes the API. `represented` is the model; `current_user` is available throughout.

### Queries (filtering/sorting)
List filtering is built from composable query objects in `app/models/queries/` with filters in `app/models/queries/filters/`. Each filter declares its valid operators (`=`, `!=`, `~`, `>=`, …) and builds the AR scope. This powers work-package filtering, project lists, the API `filters=` param, etc.

### ViewComponents + Stimulus
UI is built with ViewComponents in `app/components/` (base `ApplicationComponent`), composing GitHub **Primer** components rather than raw HTML. Front-end behavior attaches via Stimulus controllers (`frontend/src/stimulus/`) referenced from the component template's `data-controller` / `data-action` attributes. Preview components in Lookbook.

### Background jobs (Good Job)
Jobs are ActiveJob classes in `app/workers/` (base `ApplicationJob`), run by the Good Job worker (started by `bin/dev`). Use `JobConcurrency`/`good_job_control_concurrency_with` to prevent duplicate concurrent runs and `DebouncableJob` to coalesce rapid enqueues.

## Modules & Plugins

`modules/` holds 20+ first-party plugins (e.g. `bim`, `boards`, `gantt`, `github_integration`). Each is a Rails::Engine using the `acts_as_op_engine` mixin (`lib/open_project/plugins/`) and is auto-loaded by `config/initializers/00-load_plugins.rb`. A module carries its own `config/routes.rb` (prepended so plugins override core), migrations, components, and `spec/`. Add new vertical features as a module rather than bloating core `app/`.

## Database & Seeding

```bash
bundle exec rake db:seed                       # Run all seeders
bundle exec rake db:seed:only[Some::Seeder]    # Run one seeder (base class: Seeder, RootSeeder orchestrates)
bin/recreate-database                          # Drop, delete structure.sql, recreate, migrate, seed from scratch
```

The schema is tracked in `db/structure.sql` (not `schema.rb`) — migrations regenerate it.

## Additional Documentation

- `docs/development/` — Development documentation
- `docs/development/running-tests/` — Testing guide
- `docs/development/code-review-guidelines/` — Code review standards
- `CONTRIBUTING.md` — Contribution workflow
- `.github/copilot-instructions.md` — Extended agent instructions with troubleshooting
